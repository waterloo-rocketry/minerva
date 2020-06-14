const notify_command = require('../commands/notify');
const meeting_handler = require('../scheduled/events');
const agenda_command = require('../commands/agenda');
const slack_handler = require('./slack-handler');

module.exports.process = async function (request) {
    if (request.command === "/notify") {
        //return meeting_handler.checkForMeetings();
        return notify_command.send(request.user_id, request.text, request.channel_id);
    } else if (request.command === "/agenda") {
        return  agenda_command.send(request.user_id, request.text, request.channel_name)
    } else {
        return Promise.reject("Command not recognized.");
    }
}