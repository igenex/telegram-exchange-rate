module.exports = {
    compareKursBuy (kursA,kursB) {
        "use strict";
        if(kursA.buy < kursB.buy){
            return 1;
        }
        else if (kursA.buy === kursB.buy){
            return 0;
        }
        else {
            return -1;
        }
    },
    compareKursSell (kursA,kursB) {
        if(kursA.sell > kursB.sell){
            return 1;
        }
        else if (kursA.sell === kursB.sell){
            return 0;
        }
        else {
            return -1;
        }
    },
    logStart () {
        "use strict";
        console.log("Bot has been started")
    },

    getChatId(msg) {
        "use strict";
        return msg.chat.id;
    }

};