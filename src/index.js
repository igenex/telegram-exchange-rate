const telegramBot = require('node-telegram-bot-api'),
    mongoose = require('mongoose'),
    needle = require('needle'),
    cheerio = require('cheerio'),
    _ = require('lodash'),
    config = require('./config'),
    helper = require('./helper'),
    keyboard = require('./keyboard'),
    kb = require('./keyboard-buttons'),
    parser = require('./parser');

let siteUpdateTime = ['', ''];
let html = '';

mongoose.Promise = global.Promise;
mongoose.connect(config.DB_URL, {
    useMongoClient: true
})
    .then(() => {
        "use strict";
        console.log("База подключена");
    })
    .catch(err => {
        "use strict";
        console.log(err);
    });

//Присоединяем модель "обмена" для БД
require('./models/exchange.model');
require('./models/update.model');
const Exchange = mongoose.model('exchange');
const UpdatedOnSite = mongoose.model('updatedOnSite');

const bot = new telegramBot(config.TOKEN, {
    polling: true
});

bot.on('message', msg => {
    "use strict";
    const chatId = helper.getChatId(msg);
    let timerI = {};
    switch (msg.text) {
        case kb.home.kursi :
            getNewExchangeRate(chatId, false);
            bot.sendMessage(chatId, "Получаю значения курсов");
            break;
        case kb.home.kursi_loop :
            console.log("Перед установкой таймера: ", timerI);
            timerI = setInterval(getNewExchangeRate, 16000, chatId, true);
            console.log("После установки таймера: ", timerI);
            bot.sendMessage(chatId, "Циклическое обновление запущено", {
                reply_markup: {
                    keyboard: [
                        ["Получить курсы"],
                        ["Остановить обновление"]
                    ]
                }
            });
            break;
        case kb.home.kursi_loop_end :
            bot.sendMessage(chatId, "Циклическое обновление остановлено", {
                reply_markup: {
                    keyboard: [
                        ["Получить курсы"],
                        ["Запустить цикл получения курсов"]
                    ]
                }
            });
            console.log("Перед отменой таймера: ", timerI);
            clearInterval(timerI);
            console.log("После отмены таймера: ", timerI);
            break;
        default:
            console.log("Действие по умолчанию!");
    }
});

bot.onText(/\/kursi/, msg => {
    "use strict";
    const text = `Здравствуйте, ${msg.from.first_name}\n
    Выберите команду для начала работы: `;
    bot.sendMessage(helper.getChatId(msg), text, {
        reply_markup: {
            keyboard: keyboard.home
        }
    });

});


//==================FUNCTIONS=====================//

function getNewExchangeRate(chatId, loop = false) {

    new Promise((resolve, reject) => {
        UpdatedOnSite.find().sort({$natural: -1}).limit(1)
            .then(time => {
                resolve(time);
            })
    }).then(time => {
        "use strict";
        console.log("time : ", time);
        return getLastUpdateTimeFromSite(time);
    }).then(result => {
        console.log(result, " результат с парса времени");
        return getContent(result);
    })
        .then(
            result => {
                "use strict";
                //Если данные обновились, то сохраняем в БД
                console.log("Сохраняем данные в БД", result);
                return new Promise((resolve, reject) => {
                    if (result) {
                        Exchange.find().sort({"count": -1}).limit(1)
                            .then(count => {
                                console.log("Получил count с БД: ", count[0].count);
                                let curCount = ++count[0].count;
                                result[0].forEach(bank => {
                                    bank.count = curCount;
                                    new Exchange(bank).save().catch(e => console.log(e));
                                });
                                let Updated = {
                                    updatedOnSite: result[1]
                                };
                                new UpdatedOnSite(Updated).save().catch(e => console.log(e));
                                resolve();
                            });

                    } else {
                        //Выводим в бот инфу, что база время обновления на сайте не поменялось
                        let keyb = '';
                        if(!loop) {
                            keyb = "home";
                        } else {
                            keyb = "loop";
                        }
                        sendHTML(chatId, "Данные на сайте не поменялись", keyb);
                        reject();
                    }
                });
            }
        )
        .then(() => {
            "use strict";
            //Получаем данные с базы данных
            console.log("Получаем данные курсов с БД");
            return new Promise((resolve, reject) => {
                Exchange.find().sort({"count": -1}).limit(1)
                    .then(count => {
                        console.log("Получили данные с курсов с цифрой ", count[0].count);
                        Exchange.find({"count": ++count[0].count})
                            .then(kursi => {
                                console.log(" и значение ", kursi);
                                return new Promise((resolve, reject) => {
                                    let totalBanks = {
                                        buy: {},
                                        sell: {}
                                    };
                                    let banksCount = 0;

                                    kursi.sort(helper.compareKursBuy);
                                    kursi.forEach(el => {
                                        totalBanks.buy[el.buy] = totalBanks.buy.hasOwnProperty(el.buy) ? ++banksCount : banksCount = 1;
                                    });
                                    kursi.sort(helper.compareKursSell);
                                    kursi.forEach(el => {
                                        totalBanks.sell[el.sell] = totalBanks.sell.hasOwnProperty(el.sell) ? ++banksCount : banksCount = 1;
                                    });

                                    resolve([totalBanks, kursi]);
                                });
                            })
                            .then(banks => {
                                html = `<b>Курсы за ${banks[1][0].updatedActually}</b>\n`;
                                html += `<b>Покупка</b>\n`;
                                for (let kurs in banks[0].buy) {
                                    html += `<strong>${banks[0].buy[kurs]}</strong> банка : ${kurs}\n`;
                                }
                                html += `<b>Продажа</b>\n`;
                                for (let kurs in banks[0].sell) {
                                    html += `<strong>${banks[0].sell[kurs]}</strong> банка : ${kurs}\n`;
                                }
                                console.log("Тут я должен отправить данные в телегу");
                                let keyb = "";
                                if(!loop) {
                                    keyb = 'home';
                                } else {
                                    keyb = 'loop';
                                }
                                sendHTML(chatId, html, keyb);

                            });
                    })

            });
        })
        .catch(e => {
            console.log(e)
        });

}

function getLastUpdateTimeFromSite(time) {
    return new Promise((resolve, reject) => {

        needle.get(config.URL, function (err, res) {
            if (err) throw new Error(err);

            let $ = cheerio.load(res.body);

            let updateTime = $('h3.kurs_h3').text();
            let timeResult = updateTime.match(/на (.*?)\., .*? в (\d{0,1}\d:\d{0,1}\d)/i);
            let timeFromSite = timeResult[1] + " " + timeResult[2];
            let resultT = [];

            resultT.push(timeFromSite);
            console.log(timeFromSite, " : ", time[0].updatedOnSite);
            if (timeFromSite !== time[0].updatedOnSite) {
                resultT.push(true);
            } else {
                resultT.push(false);
            }

            console.log("I am resultT: ", resultT);
            resolve(resultT);
        });
    });
}

function getContent(parseOrNot) {
    return new Promise((resolve, reject) => {
        needle.get(config.URL, function (err, res) {
            "use strict";
            if (err) throw new Error(err);

            let $ = cheerio.load(res.body);
            if (parseOrNot[1]) {

                let table = $('#curr_table');
                let row = table.find('tr').not('.tablesorter-childRow');
                let result = [];

                if (table) {
                    row.each(function (i) {
                        if (i != 0 && $(this).find('td:nth-child(2)>a').text() != '') {
                            result[i] = {
                                bank: $(this).find('td:nth-child(2)>a').text(),
                                buy: parseFloat(($(this).find('td:nth-child(3)').text()).replace(",", ".")),
                                sell: parseFloat(($(this).find('td:nth-child(4)').text()).replace(",", "."))
                            };
                        }
                    });
                    result.shift();

                }

                let total = [];
                total.push(result, parseOrNot[0]);

                resolve(total);
                console.log(result);
            } else {
                resolve(false);
            }
        })
    });
}

function sendHTML(chatId, html, kbName = null) {
    const options = {
        parse_mode: "HTML"
    };

    if (kbName) {
        "use strict";
        options['reply_markup'] = {
            keyboard: keyboard[kbName]
        }
    }
    bot.sendMessage(chatId, html, options);
}

/*function saveThis() {
    "use strict";
    let content = [ { bank: 'Москва-Минск Банк', buy: 1.179, sell: 1.19 },
        { bank: 'БеларусБанк', buy: 1.179, sell: 1.194 },
        { bank: 'БелАгроПромБанк', buy: 1.176, sell: 1.195 },
        { bank: 'ТехноБанк', buy: 1.183, sell: 1.193 },
        { bank: 'Белорусский Народный Банк', buy: 1.18, sell: 1.194 },
        { bank: 'БПС-Сбербанк', buy: 1.177, sell: 1.197 },
        { bank: 'Паритетбанк', buy: 1.18, sell: 1.192 },
        { bank: 'ПриорБанк', buy: 1.172, sell: 1.198 },
        { bank: 'МТБанк', buy: 1.178, sell: 1.192 },
        { bank: 'БелИнвестБанк', buy: 1.177, sell: 1.197 },
        { bank: 'Банк БелВЭБ', buy: 1.18, sell: 1.191 },
        { bank: 'БелГазпромБанк', buy: 1.177, sell: 1.191 },
        { bank: 'пл. Свободы, 23', buy: 1.181, sell: 1.191 },
        { bank: 'БСБ Банк (БелСвиссБанк)', buy: 1.182, sell: 1.189 },
        { bank: 'ФрансаБанк', buy: 1.182, sell: 1.192 },
        { bank: 'Альфа-Банк', buy: 1.172, sell: 1.202 },
        { bank: 'БТА Банк', buy: 1.176, sell: 1.198 },
        { bank: 'РРБ-Банк', buy: 1.177, sell: 1.193 },
        { bank: 'Идея Банк', buy: 1.173, sell: 1.189 },
        { bank: 'Банк Решение', buy: 1.181, sell: 1.192 },
        { bank: 'Абсолютбанк', buy: 1.181, sell: 1.195 },
        { bank: 'Цептер Банк', buy: 1.18, sell: 1.19 },
        { bank: 'ТК Банк', buy: 1.18, sell: 1.195 } ];

    let count = 1;
    content.forEach(bank => {
        bank.count = count;
        new Exchange(bank).save().catch(e => console.log(e));
    });
}*/

// saveThis()