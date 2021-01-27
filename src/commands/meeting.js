module.exports.send = async function (userId, textParams, originChannelID, originChannelName, trigger) {
    if (textParams.startsWith("reminder")) {
        return require("./meeting/reminder").send(originChannelID);
    // the "edit" path is the default if no textParam is provided
    } else {
        return require("./meeting/edit").send(originChannelID, trigger);
    } 
};
