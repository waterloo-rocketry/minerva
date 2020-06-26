const { WebClient } = require('@slack/web-api');
const functions = require('firebase-functions');

const web = new WebClient(functions.config().slack.token);
const channelNameIdMapping = new Map();

// https://api.slack.com/methods/chat.postMessage
module.exports.postMessageToChannel = function (message, channel) {
    return web.chat.postMessage({
        text: message,
        channel: channel,
    });
}

// Given array of channels post the same mes    sage across all channels
module.exports.postMessageToChannels = function (message, channels) {
    const promises = [];
    for (var channel of channels) {
        if (channel === '') continue; //this is if we remove the initial channel sometimes it gets left in as '', possible to fix this
        promises.push(this.postMessageToChannel(message, channel));
    }
    return Promise.all(promises);
}

// https://api.slack.com/methods/chat.postMessage
// same as above, just with a thread_ts option
module.exports.postMessageToThread = function (message, channel, thread_ts) {
    return web.chat.postMessage({
        text: message,
        channel: channel,
        thread_ts: thread_ts
    });
}

// These are messages that only appear for one person
// https://api.slack.com/methods/chat.postEphemeral
module.exports.postEphemeralMessage = function (message, channel, user_id) {
    return web.chat.postEphemeral({
        channel: channel,
        text: message,
        user: user_id
    });
}

// basically just an alias
// https://api.slack.com/methods/chat.postMessage
module.exports.directMessageUser = function (message, user_id) {
    this.postMessageToChannel(message, user_id);
}

// Someone think of a better name that follows previous convention
module.exports.directMessageSingleChannelGuestsInChannels = async function (message, channels) {
    try {
        // get all single channel users in the server
        const singleChannelGuests = await this.getAllSingleChannelGuests();
        // check each channel
        channels.forEach(async (channel) => {
            // get members of the channel
            const channelMembers = (await this.getChannelMembers(channel)).members;

            const singleChannelMembersInChannel = channelMembers.filter(member => singleChannelGuests.includes(member));
            // if there is any overlap, iterate through and message them
            singleChannelMembersInChannel.forEach(member => {
                this.directMessageUser(message, member);
            });
        });
        return Promise.resolve();
    } catch (error) {        
        console.log(JSON.stringify(error));
        return Promise.reject(error);
    }
}

// Reminder: user info is returned in the data.user object, not just data
// https://api.slack.com/methods/users.info
module.exports.getUserInfo = function (user_id) {
    return web.users.info({
        user: user_id
    });
}

// Given user_id resolve if admin, reject if not.
module.exports.isAdmin = async function (user_id) {
    const user = await this.getUserInfo(user_id);
    if (user.user.is_admin) {
        return Promise.resolve();
    }
    else {
        return Promise.reject("User is not admin");
    }
}

// Requires channel ID not name
// https://api.slack.com/methods/conversations.members
module.exports.getChannelMembers = function (channel) {
    return web.conversations.members({
        channel: channel
    });
}

// Return list of all single channel guests in the entire server
module.exports.getAllSingleChannelGuests = async function () {
    const users = await web.users.list();
    var singleChannel = [];
    users.members.forEach(user => {
        if (user.is_admin) { // CHANGE TO IS_ULTRA_RESTRICICTED ON ACTUAL RELEASE
            singleChannel.push(user.id);
        }
    });
    return Promise.resolve(singleChannel);
}

module.exports.generateChannelNameIdMapping = async function () {
    if (channelNameIdMapping.length > 0) {
        return channelNameIdMapping;
    } else {
        var channels = (await this.getChannels('public_channel', true)).channels;
        channels.forEach(channel => {
            channelNameIdMapping.set(channel.name, channel.id);
        });
        return channelNameIdMapping;
    }
}

// https://api.slack.com/methods/conversations.list
module.exports.getChannels = function (types, exclude_archived) {
    return web.conversations.list({
        types: types,
        exclude_archived: exclude_archived
    });
}

module.exports.defaultChannels = ['C0155MGT7NW', 'C015BSR32E8', 'C014J93U4JZ', 'C0155TL4KKM', 'C0155MHAHB4', 'C014QV0F9AB', 'C014YVDDLTG'];