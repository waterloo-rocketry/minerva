const slack_handler = require("../../handlers/slack-handler");
const calendar_handler = require("../../handlers/calendar-handler");
const moment = require("moment-timezone");

module.exports.send = async function (originChannelId, trigger) {
    var view;
    try {
        const loadingBlock = JSON.parse(JSON.stringify(require("../../blocks/loading.json")));
        loadingBlock.blocks[0].text.text = "Loading meeting details...";

        view = await slack_handler.openView(trigger, loadingBlock);

        const event = await calendar_handler.getNextEventByTypeAndChannel("meeting", originChannelId);

        const parameters = await calendar_handler.getParametersFromDescription(event, slack_handler.defaultChannels);

        const meetingBlock = await this.parseMeetingBlock(event, parameters);

        await slack_handler.updateView(view.view.id, meetingBlock);
    } catch (error) {
        if (view != undefined) {
            const errorBlock = require("../../blocks/error.json");
            errorBlock.blocks[0].text.text = "An error has occured:\n\n*" + error + "*\n\nSee https://github.com/waterloo-rocketry/minerva for help with commands.";

            await slack_handler.updateView(view.view.id, errorBlock);
        }
        return Promise.reject(error);
    }
};

module.exports.receive = async function (meetingBlock, metadata) {
    const parameters = await this.extractMeetingParameters(meetingBlock, metadata);

    const eventId = parameters.eventId;
    const loc = parameters.location;

    // we do not want these stored in the JSON description
    delete parameters.location;
    delete parameters.eventId;
    delete parameters.updateType;

    // convert back to channel names
    var channelIdNameMapping = await slack_handler.generateChannelIdNameMapping();

    parameters.mainChannel = channelIdNameMapping.get(parameters.mainChannel);

    for (channelKey in parameters.additionalChannels) {
        if (channelIdNameMapping.has(parameters.additionalChannels[channelKey])) {
            parameters.additionalChannels[channelKey] = channelIdNameMapping.get(parameters.additionalChannels[channelKey]);
        } else {
            // this should never be reached since these values come from Slack API
            console.log(parameters.additionalChannels[channelKey] + " was not found in the channelIdMapping");
            parameters.additionalChannels.splice(channelKey, 1);
        }
    }

    const updates = {};

    updates.location = loc;
    updates.description = JSON.stringify(parameters, null, 4);

    await calendar_handler.updateEventById(eventId, updates);

    return Promise.resolve("Meeting updated");
};

module.exports.parseMeetingBlock = async function (event, parameters) {
    // Doing this copies the block to a new object so that any inputs or changes do not get applied to the next time this block is used.
    const meetingBlock = JSON.parse(JSON.stringify(require("../../blocks/meeting.json")));

    const metadata = {};

    metadata.event_id = event.id;
    metadata.channel = parameters.mainChannel;
    metadata.subject = event.summary;
    metadata.type = "meeting_update";

    // This must be stored in a string and not an object or the slack API throws an invalid arguments error
    meetingBlock.private_metadata = JSON.stringify(metadata);

    meetingBlock.blocks[0].text.text =
        "Editing meeting: *" + event.summary + "* occuring on *" + moment(event.start.dateTime).tz(moment.tz.guess()).format("MMMM Do, YYYY [at] h:mm A") + "*";

    meetingBlock.blocks[2].element.initial_value = parameters.location;
    meetingBlock.blocks[4].element.initial_value = parameters.link;
    meetingBlock.blocks[6].accessory.initial_channel = parameters.mainChannel;
    meetingBlock.blocks[8].accessory.initial_channels = parameters.additionalChannels;
    // If agendaItems is an empty array, no need for a dash
    meetingBlock.blocks[10].element.initial_value = parameters.agendaItems.length != 0 ? "- " + parameters.agendaItems.join("\n- ") : "";
    meetingBlock.blocks[12].element.initial_value = parameters.notes;
    meetingBlock.blocks[14].accessory.placeholder.text = parameters.alertType;
    meetingBlock.blocks[16].text.text =
        "Update just this meeting or all future " +
        event.summary +
        "?\n*Note: this feature has not been implemented yet. Right now, only the next meeting will be updated.*";

    return meetingBlock;
};

module.exports.extractMeetingParameters = async function (view, metadata) {
    const parameters = {};

    parameters.eventId = metadata.event_id;

    parameters.link = view.state.values.link.link.value;
    if (parameters.link === null || parameters.link === undefined) {
        parameters.link = "";
    }

    parameters.location = view.state.values.location.location.value;
    if (parameters.location === null || parameters.location === undefined) {
        parameters.location = "";
    }

    parameters.mainChannel = view.state.values.main_channel.main_channel.selected_channel;
    parameters.additionalChannels = view.state.values.additional_channels.additional_channels.selected_channels;

    // Agenda items come in like
    // - Agenda 1
    // - Agenda 2
    // etc, have to convert back to a JSON list
    if (view.state.values.agenda_items.agenda_items.value !== null && view.state.values.agenda_items.agenda_items.value !== undefined) {
        parameters.agendaItems = view.state.values.agenda_items.agenda_items.value.replace(/- /g, "").split("\n");
    } else {
        parameters.agendaItems = [];
    }

    parameters.notes = view.state.values.notes.notes.value;
    if (parameters.notes === null || parameters.notes === undefined) {
        parameters.notes = "";
    }

    if (view.state.values.alert_type.alert_type.selected_option === null) {
        parameters.alertType = view.blocks[14].accessory.placeholder.text;
    } else {
        parameters.alertType = view.state.values.alert_type.alert_type.selected_option.value;
    }

    parameters.updateType = view.state.values.update_type.update_type.selected_option.value;
    parameters.eventType = "meeting";

    return parameters;
};
