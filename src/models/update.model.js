const mongoose = require('mongoose'),
    Schema = mongoose.Schema;

const UpdateSchema = new Schema({
    updatedOnSite: {
        type: String,
        required: true
    }
});

mongoose.model('updatedOnSite', UpdateSchema);

