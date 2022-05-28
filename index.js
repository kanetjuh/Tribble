/**
 *
 *  @name Tribble
 *  @author Dylan Bolger (FivePixels) <o5pxels@gmail.com>
 *  @license MIT
 *
 * Tribble Copyright (©) 2021 Dylan Bolger (FivePixels)
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
const dotenvParseVariables = require('dotenv-parse-variables');
env = require('dotenv').config({ path: dev ? 'dev.env' : '.env' });
env = dotenvParseVariables(env.parsed)
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

// check for all required variables
if ((!env.DISCORD_TOKEN ||
    !env.GOOGLE_CLIENT_ID ||
    !env.GOOGLE_CLIENT_SECRET ||
    !env.GOOGLE_REFRESH_TOKEN ||
    !env.GUILD_ID ||
    !env.TICKET_CATEGORY_ID ||
    !env.PURCHASED_ROLE_ID ||
    !env.ITEMS_TO_SELL ||
    !env.ITEMS_PRICES ||
    typeof env.USE_CASHAPP !== 'boolean' ||
    typeof env.USE_VENMO !== 'boolean' ||
    typeof env.USE_PAYPAL !== 'boolean' ||
    typeof env.SHOP_MODE !== 'boolean' ||
    !env.ITEMS_TO_SELL instanceof Array ||
    !env.ITEMS_PRICES instanceof Array ||
    !env.ITEMS_DESCRIPTIONS instanceof Array ||
    !env.PAYMENT_CURRENCY) ||
    (env.USE_CASHAPP && !env.CASHAPP_USERNAME) ||
    (env.USE_VENMO && (!env.VENMO_USERNAME || !env.VENMO_4_DIGITS)) ||
    (env.USE_PAYPAL && !env.PAYPALME_LINK)) {
    log.error('At least one required field is missing from the configuration. Check your .env file.');
    process.exit(1);
}

if (!env.SHOP_MODE) {
    env.ITEMS_TO_SELL.length = 1;
}
// load products info
productsNames = env.ITEMS_TO_SELL;
productsDescriptions = env.ITEMS_DESCRIPTIONS;
productsPrices = env.ITEMS_PRICES;
productsReacts = env.PRODUCTS_REACTS;
if (productsNames.length != productsPrices.length && productsPrices.length != productsReacts.length) {
    log.error("The number of products doesn\'t match the number of prices. Check your .env file.");
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

client.login(env.DISCORD_TOKEN)

var auth = new google.auth.OAuth2(
    env.GOOGLE_CLIENT_ID,
    env.GOOGLE_CLIENT_SECRET
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
                description: `Send the **exact** amount of \`${selectedProduct.price} ${env.PAYMENT_CURRENCY}\` to \`$${env.CASHAPP_USERNAME}\` on Cash App.\n\n**__DO NOT FORGET TO SEND THE CODE IN THE NOTE.__**\n\nFor the note, type the **exact** code below: \`\`\`${identifier}\`\`\``,
                color: env.MENU_COLOR,
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
                description: `Please send the **exact** amount of \`${selectedProduct.price} ${env.PAYMENT_CURRENCY}\`  to \`@${env.VENMO_USERNAME}\` on Venmo.\n\n**__DO NOT FORGET TO SEND THE CODE IN THE NOTE.__**\n\nFor the note, type the **exact** code below: \`\`\`${identifier}\`\`\`\nIf Venmo asks for last 4 digits: \`${env.VENMO_4_DIGITS}\``,
                color: env.MENU_COLOR,
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
                description: `Please send the **exact** amount of \`${selectedProduct.price} ${env.PAYMENT_CURRENCY}\` to ${env.PAYPALME_LINK}.\n\n**__DO NOT FORGET TO SEND THE CODE IN THE NOTE.__**\n\nFor the note, type the **exact** code below: \`\`\`${identifier}\`\`\``,
                color: env.MENU_COLOR,
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

auth.setCredentials({ refresh_token: env.GOOGLE_REFRESH_TOKEN });

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
            name: env.PRESENCE_ACTIVITY,
            type: env.PRESENCE_TYPE.toUpperCase()
        }
    })
    if (client.guilds.cache.get(env.GUILD_ID).member(client.user).hasPermission('ADMINISTRATOR', false)) {
        log.success('Bot has the \'ADMINISTRATOR\' permission');
    } else log.warn('Bot does not have \'ADMINISTRATOR\' permission');
    client.guilds.cache.get(env.GUILD_ID).roles.fetch().then((roles) => {
        purchasedRole = roles.cache.get(env.PURCHASED_ROLE_ID);
    });
});

client.on('message', async message => {
    if (message.content === `${env.COMMAND_PREFIX}close`) {
        message.channel.delete();
    }
    if (message.content === `${env.COMMAND_PREFIX}panel`) {
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
            .setTitle(env.PANEL_TITLE)
            .setDescription(env.PANEL_DESCRIPTION)
            .setColor(env.PANEL_COLOR)
            .setFooter(env.PANEL_FOOTER)
            .setThumbnail(env.PANEL_THUMBNAIL)
        )
        log.info('New panel created successfully')
        panel.react(env.PANEL_REACT_EMOJI)
        settings.set('panel_message_id', panel.id)
    }
})


client.on('messageReactionAdd', async (reaction, user) => {
    if (user.bot) return;
    if (reaction.message.id == settings.get('panel_message_id') && reaction.emoji.name == env.PANEL_REACT_EMOJI) {
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
                        ticketMember.roles.add(purchasedRole).catch(console.error);
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
            parent: env.TICKET_CATEGORY_ID,
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
            if (!env.SHOP_MODE) {
                delete paymentReacts['◀'];
            }
            // NB: There may be a cleaner way to do this
            if (!env.USE_CASHAPP) {
                paymentFields.splice(paymentFields.findIndex(({ name }) => name === "Cash App"), 1);
                delete paymentReacts['🇨'];
            }
            if (!env.USE_VENMO) {
                paymentFields.splice(paymentFields.findIndex(({ name }) => name === "Venmo"), 1);
                delete paymentReacts['🇻'];
            }
            if (!env.USE_PAYPAL) {
                paymentFields.splice(paymentFields.findIndex(({ name }) => name === "PayPal"), 1);
                delete paymentReacts['🇵'];
            }
            const tosMenu = {
                name: 'TOS',
                content: new Discord.MessageEmbed({
                    title: env.TOS_TITLE,
                    color: env.MENU_COLOR,
                    description: env.TOS_DESCRIPTION.toString(),
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
                        if (!env.SHOP_MODE) {
                            menu.setPage(menusMap.get("payment"))
                        } else {
                            menu.setPage(menusMap.get("products"))
                        }
                    },
                    '❌': onTicketEnding.bind(null, channel, false)
                }
            }
            if (env.SHOP_MODE) {
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
                    title: env.PRODUCTS_TITLE,
                    color: env.MENU_COLOR,
                    description: env.PRODUCTS_DESCRIPTION,
                    fields: productFields,
                }),
                reactions: productMenuReacts
            }
            const paymentsMenu = {
                name: 'payment',
                content: new Discord.MessageEmbed({
                    title: 'Select a Payment Method',
                    color: env.MENU_COLOR,
                    description: 'React with the payment method you are using to make the purchase.\n\n',
                    fields: paymentFields
                }),
                reactions: paymentReacts
            }
            if (env.ENABLE_TOS) {
                menus.push(tosMenu);
            }
            if (env.SHOP_MODE) {
                menus.push(productsMenu)
            }
            menus.push(paymentsMenu)
            if (!env.SHOP_MODE) {
                selectedProduct = productMap.values().next().value; // gets the first product in map
                createPaymentMenusForProduct(selectedProduct, identifier, channel);
            }
            const pages = [
                {
                    name: 'confirmation',
                    color: env.MENU_COLOR,
                    content: new Discord.MessageEmbed({
                        title: `Checking for payment...`,
                        description: 'Checking for your payment...',
                    })
                },
                {
                    name: 'fail',
                    color: env.MENU_COLOR,
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
                    color: env.MENU_COLOR,
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
