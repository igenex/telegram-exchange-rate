const mongoose = require('mongoose'),
    Schema = mongoose.Schema;

const ExchangeSchema = new Schema({
    bank: {
        type: String,
        required: true
    },
    buy: {
        type: Number,
        required: true
    },
    sell: {
        type: Number,
        required: true
    },
    updatedActually: {
        type: Date,
        default: Date.now
    },
    count: {
        type: Number,
        required: true
    }

});

mongoose.model('exchange', ExchangeSchema);


