/**
 *
 *  @name Tribble
 *  @author Dylan Bolger (FivePixels)
 *  @license MIT
 *
 * Tribble Copyright (©) 2022 Dylan Bolger (FivePixels)
 *
 * This is free software, and you are welcome to redistribute it
 * under certain conditions. See the included LICENSE file for details.
 *
 */

const menusMap = new Map();
const menus = [];
class Product {
    // TODO: add configuration for specific payment methods for specific products
    // TODO: add role field for custom role for each product purchased
    price;
    name;
    react;
    payments;
    constructor(price, name, react) {
        this.price = price;
        this.name = name;
        this.react = react;
    }
}

dev = false; // Change this if you are contributing to Tribble.
var config = require(dev ? './dev.json' : './config.json');
const Discord = require('discord.js');
const Logger = require('leekslazylogger');
const log = new Logger({
    name: "Tribble",
    keepSilent: true
});
const client = new Discord.Client({
    autoReconnect: true,
    partials: ['MESSAGE', 'CHANNEL', 'REACTION']
});
const enmap = require('enmap');
const { google } = require('googleapis');
const { Menu } = require('discord.js-menu');
const productMap = new Map();

const settings = new enmap({
    name: "settings",
    autoFetch: true,
    cloneLevel: "deep",
    fetchAll: true
});

class PaymentProviderInfo {
    name;
    email;
    paymentString;
    messageQuery;
    constructor(name, email, paymentString, messageQuery) {
        this.name = name;
        this.email = email;
        this.paymentString = paymentString;
        this.messageQuery = messageQuery;
    }
}
config_keys = ['DISCORD_TOKEN', 'GUILD_ID', 'TICKET_CATEGORY_ID', 'PURCHASED_ROLE_ID', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REFRESH_TOKEN', 'SHOP_MODE', 'ITEMS_TO_SELL', 'ITEMS_PRICES', 'ITEMS_DESCRIPTIONS', 'PAYMENT_CURRENCY', 'USE_CASHAPP', 'CASHAPP_USERNAME', 'USE_VENMO', 'VENMO_USERNAME', 'VENMO_4_DIGITS', 'USE_PAYPAL', 'PAYPALME_LINK', 'COMMAND_PREFIX', 'PRESENCE_ACTIVITY', 'PRESENCE_TYPE', 'PANEL_COLOR', 'PANEL_TITLE', 'PANEL_THUMBNAIL', 'PANEL_DESCRIPTION', 'PANEL_FOOTER', 'PANEL_REACT_EMOJI', 'ENABLE_TOS', 'TOS_COLOR', 'TOS_TITLE', 'TOS_DESCRIPTION', 'PRODUCTS_TITLE', 'PRODUCTS_DESCRIPTION', 'PRODUCTS_REACTS', 'SUCCESSFUL_PAYMENT_TITLE', 'SUCCESSFUL_PAYMENT_DESC']
for (key of config_keys) {
    if (!config.hasOwnProperty(key)) {
        log.error("Missing key in configuration: " + key + ". Please check your configuration.");
        process.exit(1);
    } else if (['DISCORD_TOKEN', 'GUILD_ID', 'TICKET_CATEGORY_ID', 'PURCHASED_ROLE_ID', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REFRESH_TOKEN'].includes(key)) {
        if (!config[key]) {
            log.error("Missing required value in configuration for key '" + key + "'. Please check your configuration.");
            process.exit(1);
        }
    }
}

for (array_key of ["ITEMS_TO_SELL", "ITEMS_PRICES", "ITEMS_DESCRIPTIONS"]) {
    config[array_key] = config[array_key].split(',');
}

if (!config.SHOP_MODE) {
    config.ITEMS_TO_SELL.length = 1;
    config.ITEMS_PRICES.length = 1;
    config.ITEMS_DESCRIPTIONS.length = 1;
}
// load products info
productsNames = config.ITEMS_TO_SELL;
productsDescriptions = config.ITEMS_DESCRIPTIONS;
productsPrices = config.ITEMS_PRICES;
productsReacts = config.PRODUCTS_REACTS;
if (productsNames.length != productsPrices.length && productsPrices.length != productsReacts.length) {
    log.error("The number of products doesn\'t match the number of prices. Please check your configuration.");
    process.exit(1);
} else {
    // do setup for products
    for (var i = 0; i < productsNames.length; i++) {
        // create a product for each product, store each by the pair "productName:Product"
        productMap.set(productsNames[i], new Product(productsPrices[i], productsNames[i], productsReacts[i]));
    }
    // initialize and declare productFields for menu
    productFields = [];
    for (var i = 0; i < productsNames.length; i++) {
        // create a new field for each product based on info in config
        var object = {
            "name": productsNames[i],
            "value": productsDescriptions[i],
            "inline": true
        }
        productFields.push(object);
    }
    // initalize productMenuReacts
    productMenuReacts = {};
}

client.login(config.DISCORD_TOKEN)

var auth = new google.auth.OAuth2(
    config.GOOGLE_CLIENT_ID,
    config.GOOGLE_CLIENT_SECRET
);

function createPaymentMenusForProduct(selectedProduct, identifier, channel) {
    providerInfo = [];
    providerInfoForProduct = [
        {
            name: `cashapp`,
            email: `cash@square.com`,
            // messageQuery checks to see if it ends in .00, if it does truncate, otherwise keep the exact decimal
            paymentAmount: `${selectedProduct.price.endsWith('.00') ? selectedProduct.price.substring(0, selectedProduct.price.length - 3) : selectedProduct.price}`,
            messageQuery: `sent you`
        },
        {
            name: `venmo`,
            email: `venmo@venmo.com`,
            paymentAmount: `${selectedProduct.price}`,
            messageQuery: `paid you`
        },
        {
            name: `paypal`,
            email: `service@paypal.com`,
            paymentAmount: `${selectedProduct.price}`,
            messageQuery: ``
        }
    ];
    for (provider in providerInfoForProduct) {
        thisProvider = providerInfoForProduct[provider];
        thisInfo = new PaymentProviderInfo(thisProvider.name, thisProvider.email, thisProvider.paymentAmount, thisProvider.messageQuery);
        providerInfo.push(thisInfo);
    }
    paymentMenus = [
        {
            name: 'cashapp',
            content: new Discord.MessageEmbed({
                title: `You\'re purchasing the ${selectedProduct.name} product using Cash App.`,
                description: `Send the **exact** amount of \`${selectedProduct.price} ${config.PAYMENT_CURRENCY}\` to \`$${config.CASHAPP_USERNAME}\` on Cash App.\n\n**__DO NOT FORGET TO SEND THE CODE IN THE NOTE.__**\n\nFor the note, type the **exact** code below: \`\`\`${identifier}\`\`\``,
                color: config.MENU_COLOR,
                fields: [
                    {
                        name: "Return to payment selection",
                        value: "◀",
                        inline: true
                    },
                    {
                        name: "Payment has been sent",
                        value: "✅",
                        inline: true
                    },
                    {
                        name: "Cancel transaction",
                        value: "❌",
                        inline: true
                    }
                ]
            }),
            reactions: {
                '◀': 'payment',
                '✅': onPaymentSent,
                '❌': onTicketEnding.bind(null, channel, false)
            }
        },
        {
            name: 'venmo',
            content: new Discord.MessageEmbed({
                title: `You\'re purchasing the ${selectedProduct.name} product using Venmo.`,
                description: `Please send the **exact** amount of \`${selectedProduct.price} ${config.PAYMENT_CURRENCY}\`  to \`@${config.VENMO_USERNAME}\` on Venmo.\n\n**__DO NOT FORGET TO SEND THE CODE IN THE NOTE.__**\n\nFor the note, type the **exact** code below: \`\`\`${identifier}\`\`\`\nIf Venmo asks for last 4 digits: \`${config.VENMO_4_DIGITS}\``,
                color: config.MENU_COLOR,
                fields: [
                    {
                        name: "Return to payment selection",
                        value: "◀",
                        inline: true
                    },
                    {
                        name: "Payment has been sent",
                        value: "✅",
                        inline: true
                    },
                    {
                        name: "Cancel transaction",
                        value: "❌",
                        inline: true
                    }
                ]
            }),
            reactions: {
                '◀': 'payment',
                '✅': onPaymentSent,
                '❌': onTicketEnding.bind(null, channel, false)
            }
        },
        {
            name: 'paypal',
            content: new Discord.MessageEmbed({
                title: `You\'re purchasing the ${selectedProduct.name} product using PayPal.`,
                description: `Please send the **exact** amount of \`${selectedProduct.price} ${config.PAYMENT_CURRENCY}\` to ${config.PAYPALME_LINK}.\n\n**__DO NOT FORGET TO SEND THE CODE IN THE NOTE.__**\n\nFor the note, type the **exact** code below: \`\`\`${identifier}\`\`\``,
                color: config.MENU_COLOR,
                fields: [
                    {
                        name: "Return to payment selection",
                        value: "◀",
                        inline: true
                    },
                    {
                        name: "Payment has been sent",
                        value: "✅",
                        inline: true
                    },
                    {
                        name: "Cancel transaction",
                        value: "❌",
                        inline: true
                    }
                ]
            }),
            reactions: {
                '◀': 'payment',
                '✅': onPaymentSent,
                '❌': onTicketEnding.bind(null, channel, false)
            }
        }
    ];
    for (payment in paymentMenus) {
        thisPayment = paymentMenus[payment];
        menus.push(thisPayment)
        menusMap.set(thisPayment.name, (menusMap.size).toString())
    }
    return paymentMenus;
}

auth.setCredentials({ refresh_token: config.GOOGLE_REFRESH_TOKEN });

async function checkForEmail(auth, payment, code, providerInfo) {
    let valid;
    let fromAddress = providerInfo.find(object => object.name === payment).email;
    let query = providerInfo.find(object => object.name === payment).messageQuery;
    let price = providerInfo.find(object => object.name === payment).paymentString;
    const gmail = google.gmail({ version: 'v1', auth });
    const emails = (await gmail.users.messages.list({
        userId: 'me',
        q: `${query} ${code} from:${fromAddress}`
    })).data.messages;
    if (emails != undefined) {
        if (emails.length == 1) {
            log.info("An email was found with the searched parameters.");
            await gmail.users.messages.get({
                userId: 'me',
                id: `${emails[0].id}`
            }).then(email => {
                let subject = email.data.payload.headers.find(object => object.name === 'Subject').value;
                switch (payment) {
                    case 'cashapp':
                        if (subject.match(`^[^$]*${query} (\\${price}) for (${code})$`).length == 3) {
                            // user sent correct amount + didn't fake note, all three match groups matched
                            valid = true;
                        } else {
                            // user either didn't send correct amount or faked note
                            valid = false;
                        }
                        break;
                    default:
                        // venmo/paypal
                        if (subject.includes`${code}`) {
                            // malicious email, venmo/paypal doesn't send the note in the subject
                            valid = false;
                        } else if (subject.includes(`${query} ${price}`)) {
                            // TODO: check body
                            valid = true;
                        }
                        break;
                }
            });
        } else if (emails.length > 1 || emails.length < 1) {
            log.warn("Either no email was found or multiple emails were found with the provided code.");
            valid = false;
        }
    } else {
        valid = false;
    }
    return valid;
}

client.on('ready', async () => {
    log.success(`Authenticated as ${client.user.tag}`);
    client.user.setPresence({
        activity: {
            name: config.PRESENCE_ACTIVITY,
            type: config.PRESENCE_TYPE.toUpperCase()
        }
    })
    if (client.guilds.cache.get(config.GUILD_ID).member(client.user).hasPermission('ADMINISTRATOR', false)) {
        log.success('Bot has the \'ADMINISTRATOR\' permission');
    } else log.warn('Bot does not have \'ADMINISTRATOR\' permission');
    // client.guilds.cache.get(config.GUILD_ID).roles
    purchasedRole = client.guilds.cache.get(config.GUILD_ID).roles.cache.get(config.PURCHASED_ROLE_ID);
});

client.on('message', async message => {
    if (message.content === `${config.COMMAND_PREFIX}close`) {
        message.channel.delete();
    }
    if (message.content === `${config.COMMAND_PREFIX}panel`) {
        let panel;
        let channel = message.channel;
        let messageID = settings.get('panel_message_id');
        let channelID = settings.get('panel_channel_id');
        if (!channelID) {
            settings.set('panel_channel_id', message.channel.id);
            channelID = settings.get('panel_channel_id');
        }
        if (!messageID) {
            settings.set('panel_message_id', '');
        } else {
            try {
                panel = await client.channels.cache.get(channelID).messages.fetch(messageID);
                if (panel) {
                    panel.delete().then(() => log.info('Deleted previous panel')).catch(e => log.warn(e));
                }
            }
            catch (error) {
                log.error(error)
                log.error('Error deleting panel')
            }
        }
        message.delete();
        panel = await channel.send(new Discord.MessageEmbed()
            .setTitle(config.PANEL_TITLE)
            .setDescription(config.PANEL_DESCRIPTION)
            .setColor(config.PANEL_COLOR)
            .setFooter(config.PANEL_FOOTER)
            .setThumbnail(config.PANEL_THUMBNAIL)
        )
        log.info('New panel created successfully')
        panel.react(config.PANEL_REACT_EMOJI)
        settings.set('panel_message_id', panel.id)
    }
})


client.on('messageReactionAdd', async (reaction, user) => {
    if (user.bot) return;
    if (reaction.message.id == settings.get('panel_message_id') && reaction.emoji.name == config.PANEL_REACT_EMOJI) {
        reaction.users.remove(user); // remove the reaction
        if (settings.get(`${user.id}`)) {
            id = settings.get(`${user.id}`)
            prevChannel = reaction.message.guild.channels.cache.find(channel => channel.name === `ticket-${id}`);
            if (typeof prevChannel !== 'undefined') {
                prevChannel.delete();
            }
        }
        var identifier = Math.floor(100000 + Math.random() * 900000); // generate a random, six-digit number.
        menu = null;
        onPaymentSent = async () => {
            try {
                menu.setPage(menusMap.get("confirmation"));
                checkForEmail(auth, selectedPayment, identifier, providerInfo).then((result) => {
                    if (menu && result) {
                        menu.setPage(menusMap.get("success"));
                        ticketMember.roles.add(purchasedRole).catch(log.error);
                    } else if (menu) {
                        menu.setPage(menusMap.get("fail"));
                    } else {
                        return;
                    }
                })
            } catch (error) {
                log.error(error)
            }
        }
        onTicketEnding = async (channel, isFinishing) => {
            if (menu != null) {
                menu.stop();
            }
            if (channel) {
                channel.delete();
            }
            if (isFinishing) {
                settings.delete(`${user.id}`);
            }
        }
        var ticket = `ticket-${identifier}`;
        reaction.message.guild.channels.create(ticket, {
            parent: config.TICKET_CATEGORY_ID,
            permissionOverwrites: [{
                id: user.id,
                allow: ["VIEW_CHANNEL"],
                deny: ["SEND_MESSAGES"]
            },
            {
                id: reaction.message.guild.roles.everyone,
                deny: ["VIEW_CHANNEL"]
            }
            ],
            type: 'text'
        }).then(async channel => {
            ticketMember = reaction.message.guild.members.cache.get(user.id)
            identifier = identifier;
            settings.set(`${user.id}`, `${identifier}`);
            // configure paymentFields in menu
            var paymentFields = [{
                name: "Cash App",
                value: "🇨",
                inline: true
            },
            {
                name: "Venmo",
                value: "🇻",
                inline: true
            },
            {
                name: "PayPal",
                value: "🇵",
                inline: true
            }]
            var paymentReacts = {
                '🇨': async () => {
                    selectedPayment = "cashapp";
                    menu.setPage(menusMap.get("cashapp"));
                },
                '🇻': async () => {
                    selectedPayment = "venmo";
                    menu.setPage(menusMap.get("venmo"));
                },
                '🇵': async () => {
                    selectedPayment = "paypal";
                    menu.setPage(menusMap.get("paypal"));
                },
                '◀': async () => {
                    selectedPaymentProduct = null;
                    menu.setPage(menusMap.get("products"));
                },
                '❌': onTicketEnding.bind(null, channel, false)
            }
            if (!config.SHOP_MODE) {
                delete paymentReacts['◀'];
            }
            // NB: There may be a cleaner way to do this
            if (!config.USE_CASHAPP) {
                paymentFields.splice(paymentFields.findIndex(({ name }) => name === "Cash App"), 1);
                delete paymentReacts['🇨'];
            }
            if (!config.USE_VENMO) {
                paymentFields.splice(paymentFields.findIndex(({ name }) => name === "Venmo"), 1);
                delete paymentReacts['🇻'];
            }
            if (!config.USE_PAYPAL) {
                paymentFields.splice(paymentFields.findIndex(({ name }) => name === "PayPal"), 1);
                delete paymentReacts['🇵'];
            }
            const tosMenu = {
                name: 'TOS',
                content: new Discord.MessageEmbed({
                    title: config.TOS_TITLE,
                    color: config.MENU_COLOR,
                    description: config.TOS_DESCRIPTION.toString(),
                    fields: [
                        {
                            name: "Agree",
                            value: "✅",
                            inline: true
                        },
                        {
                            name: "Cancel transaction",
                            value: "❌",
                            inline: true
                        }
                    ]
                }),
                reactions: {
                    '✅': async () => {
                        if (!config.SHOP_MODE) {
                            menu.setPage(menusMap.get("payment"))
                        } else {
                            menu.setPage(menusMap.get("products"))
                        }
                    },
                    '❌': onTicketEnding.bind(null, channel, false)
                }
            }
            if (config.SHOP_MODE) {
                for (var i = 0; i <= productsNames.length; i++) {
                    product = productsNames[i];
                    if (i == productsNames.length) {
                        productMenuReacts['❌'] = onTicketEnding.bind(null, channel, false);
                        break;
                    }
                    let thisReact = productsReacts[i];
                    productMenuReacts[thisReact] = async () => {
                        indexOfReact = productsReacts.indexOf(thisReact);
                        selectedProduct = productMap.get(productsNames[indexOfReact]);
                        menu.setPage(menusMap.get("payment"));
                        menu.addPages(createPaymentMenusForProduct(selectedProduct, identifier, channel));
                    }
                }
            }
            const productsMenu = {
                name: 'products',
                content: new Discord.MessageEmbed({
                    title: config.PRODUCTS_TITLE,
                    color: config.MENU_COLOR,
                    description: config.PRODUCTS_DESCRIPTION,
                    fields: productFields,
                }),
                reactions: productMenuReacts
            }
            const paymentsMenu = {
                name: 'payment',
                content: new Discord.MessageEmbed({
                    title: 'Select a Payment Method',
                    color: config.MENU_COLOR,
                    description: 'React with the payment method you are using to make the purchase.\n\n',
                    fields: paymentFields
                }),
                reactions: paymentReacts
            }
            if (config.ENABLE_TOS) {
                menus.push(tosMenu);
            }
            if (config.SHOP_MODE) {
                menus.push(productsMenu)
            }
            menus.push(paymentsMenu)
            if (!config.SHOP_MODE) {
                selectedProduct = productMap.values().next().value; // gets the first product in map
                createPaymentMenusForProduct(selectedProduct, identifier, channel);
            }
            const pages = [
                {
                    name: 'confirmation',
                    color: config.MENU_COLOR,
                    content: new Discord.MessageEmbed({
                        title: `Checking for payment...`,
                        description: 'Checking for your payment...',
                    })
                },
                {
                    name: 'fail',
                    color: config.MENU_COLOR,
                    content: new Discord.MessageEmbed({
                        title: `Payment unsuccessful`,
                        description: 'No payment detected. Try to check for the payment again after you\'ve sent it.',
                        fields: [
                            {
                                name: "Return to payment instructions",
                                value: "◀",
                                inline: true
                            },
                            {
                                name: "Check for payment again",
                                value: "🔄",
                                inline: true
                            },

                        ]
                    }),
                    reactions: {
                        '◀': async () => {
                            switch (selectedPayment) {
                                case "cashapp":
                                    menu.setPage(menusMap.get("cashapp"));
                                    break;
                                case "venmo":
                                    menu.setPage(menusMap.get("venmo"));
                                    break;
                                case "paypal":
                                    menu.setPage(menusMap.get("paypal"));
                                    break;
                            }
                        },
                        '🔄': onPaymentSent
                    }
                },
                {
                    name: 'success',
                    color: config.MENU_COLOR,
                    content: new Discord.MessageEmbed({
                        title: `Payment Successful`,
                        description: `Your payment has been received! You have been granted access to the \`${purchasedRole.name}\` role. Thank you!`,
                        fields: [
                            {
                                name: "Close ticket",
                                value: "✅",
                                inline: true
                            }
                        ]
                    }),
                    reactions: {
                        '✅': onTicketEnding.bind(null, channel, true)
                    }
                }
            ]
            for (pageIndex in pages) {
                menus.push(pages[pageIndex]);
            }
            for (menu in menus) {
                menusMap.set(menus[menu].name, menu)
            }
            menu = new Menu(channel, user.id, menus, 300000);
            menu.start();
            channel.send(`<@${user.id}>, your unique ticket code is \`${identifier}\`. **DO NOT FORGET TO SEND THE CODE.**`)
        }).catch(log.error)
    } else {
        return;
    }
})
