const test = require('firebase-functions-test')();
const assert = require('assert');
const chai = require('chai');
chai.use(require('chai-as-promised'));
const expect = require('chai').expect;

// Although we will not be using any API features, without mocking these values they become undefined and the tests fail
test.mockConfig({
    slack: {
        token: ''
    },
    calendar: {
        client: '',
        secret: '',
        redirect: ''
    }
});

const event = require('../scheduled/events');

describe('scheduled/event.js tests', function () {
    describe('isEventSoon', function () {
        it('check event below lower bounds', async function () {
            await expect(event.isEventSoon(-1)).to.be.rejectedWith("no-send");
        });
        it('check event within lower bounds', async function () {
            assert.equal(await event.isEventSoon(300000 - 1), true);
            assert.equal(await event.isEventSoon(1), true);
        });
        it('check event between bounds', async function () {
            await expect(event.isEventSoon(300000 + 1)).to.be.rejectedWith("no-send");
            await expect(event.isEventSoon(21600000 - 300000 - 1)).to.be.rejectedWith("no-send");
        });
        it('check event within upper bounds', async function () {
            assert.equal(await event.isEventSoon(21600000), false);
            assert.equal(await event.isEventSoon(21600000 + 300000 - 1), false);
            assert.equal(await event.isEventSoon(21600000 - 300000 + 1), false);
        });
        it('check event above upper bounds', async function () {
            await expect(event.isEventSoon(21600000 + 300000 + 1)).to.be.rejectedWith("no-send");
        });
    });

    describe('parseDescription', function () {
        const channelIDMapping = new Map();
        channelIDMapping.set("general", "C014J93U4JZ");
        channelIDMapping.set("propulsion", "C0155MHAHB4");
        it('parse description, no agenda items', async function () {
            assert.deepEqual(await event.parseDescription("Meeting", "meeting\nalert-single-channel\n#general\ndefault\n\nN/A", channelIDMapping), {
                type: "meeting",
                main_channel: "C014J93U4JZ",
                additional_channels: ['C0155MGT7NW', 'C015BSR32E8', 'C0155TL4KKM', 'C0155MHAHB4', 'C014QV0F9AB', 'C014YVDDLTG'],
                alert_type: "alert-single-channel",
                agenda: "",
                extra: "N/A"
            });
        });
        it('parse description, agenda items', async function () {
            assert.deepEqual(await event.parseDescription("Meeting", "meeting\nalert-single-channel\n#general\ndefault\nitem,item1,item2\nN/A", channelIDMapping), {
                type: "meeting",
                main_channel: "C014J93U4JZ",
                additional_channels: ['C0155MGT7NW', 'C015BSR32E8', 'C0155TL4KKM', 'C0155MHAHB4', 'C014QV0F9AB', 'C014YVDDLTG'],
                alert_type: "alert-single-channel",
                agenda: "\n    • item\n    • item1\n    • item2",
                extra: "N/A"
            });
        });
        it('parse description, agenda items, non default channels no translation', async function () {
            assert.deepEqual(await event.parseDescription("Meeting", "test\nalert-main-channel\n#general\n#test #rest #lest\nitem,item1,item2\nN/A", channelIDMapping), {
                type: "test",
                main_channel: "general",
                additional_channels: ['test', 'rest', 'lest'],
                alert_type: "alert-main-channel",
                agenda: "\n    • item\n    • item1\n    • item2",
                extra: "N/A"
            });
        });
        it('parse description, agenda items, non default channels translation', async function () {
            assert.deepEqual(await event.parseDescription("Meeting", "test\nalert-single-channel\n#general\n#general #propulsion\nitem,item1,item2\nN/A", channelIDMapping), {
                type: "test",
                main_channel: "C014J93U4JZ",
                additional_channels: ['C0155MHAHB4'],
                alert_type: "alert-single-channel",
                agenda: "\n    • item\n    • item1\n    • item2",
                extra: "N/A"
            });
        });
    });

    describe('generateMessage', function () {
        const e = {
            summary: "Test Event",
            location: "The Bay"
        }

        it('check close message', async function () {
            assert.deepEqual(await event.generateMessage(e, {
                type: "meeting",
                main_channel: "C014J93U4JZ",
                additional_channels: ['C0155MHAHB4'],
                alert_type: "alert-single-channel",
                agenda: "\n    • item\n    • item1\n    • item2",
                extra: "N/A"
            }, 300000 - 1, true, new Date(1592900639642)), "<!channel>\nReminder: *Test Event* is occuring in *5 minutes*\nPlease see the agenda items:\n    • item\n    • item1\n    • item2\nNotes: N/A\nWays to attend:\n      :office: In person @ The Bay\n      :globe_with_meridians: Online @ https://meet.jit.si/bay_area\n      :calling: By phone +1-437-538-3987 (2633 1815 39)");
        });
        it('check far message', async function () {
            assert.deepEqual(await event.generateMessage(e, {
                type: "meeting",
                main_channel: "C014J93U4JZ",
                additional_channels: ['C0155MHAHB4'],
                alert_type: "alert",
                agenda: "\n    • item\n    • item1\n    • item2",
                extra: "N/A"
            }, 300000 - 1, false, new Date(1592900639642)), "<!channel>\nReminder: *Test Event* is occuring on *6/23/2020, 4:23:59 AM*\nPlease see the agenda items:\n    • item\n    • item1\n    • item2\nNotes: N/A\nReact with :watermelon: if you're coming!");
        });
        it('check no agenda items', async function () {
            assert.deepEqual(await event.generateMessage(e, {
                type: "meeting",
                main_channel: "C014J93U4JZ",
                additional_channels: ['C0155MHAHB4'],
                alert_type: "alert",
                agenda: "",
                extra: "N/A"
            }, 300000 - 1, false, new Date(1592900639642)), "<!channel>\nReminder: *Test Event* is occuring on *6/23/2020, 4:23:59 AM*\nThere are currently no agenda items listed for this meeting.\nNotes: N/A\nReact with :watermelon: if you're coming!");
        });
        it('check copy message', async function () {
            assert.deepEqual(await event.generateMessage(e, {
                type: "meeting",
                main_channel: "C014J93U4JZ",
                additional_channels: ['C0155MHAHB4'],
                alert_type: "alert-main-channel",
                agenda: "\n    • item\n    • item1\n    • item2",
                extra: "N/A"
            }, 300000 - 1, true, new Date(1592900639642)), "Reminder: *Test Event* is occuring in *5 minutes*\nPlease see the agenda items:\n    • item\n    • item1\n    • item2\nNotes: N/A\nWays to attend:\n      :office: In person @ The Bay\n      :globe_with_meridians: Online @ https://meet.jit.si/bay_area\n      :calling: By phone +1-437-538-3987 (2633 1815 39)");
        });
        it('check meeting message', async function () {
            assert.deepEqual(await event.generateMessage(e, {
                type: "meeting",
                main_channel: "C014J93U4JZ",
                additional_channels: ['C0155MHAHB4'],
                alert_type: "alert-single-channel",
                agenda: "\n    • item\n    • item1\n    • item2",
                extra: "N/A"
            }, 300000 - 1, true, new Date(1592900639642)), "<!channel>\nReminder: *Test Event* is occuring in *5 minutes*\nPlease see the agenda items:\n    • item\n    • item1\n    • item2\nNotes: N/A\nWays to attend:\n      :office: In person @ The Bay\n      :globe_with_meridians: Online @ https://meet.jit.si/bay_area\n      :calling: By phone +1-437-538-3987 (2633 1815 39)");
        });
        it('check test message', async function () {
            assert.deepEqual(await event.generateMessage(e, {
                type: "test",
                main_channel: "C014J93U4JZ",
                additional_channels: ['C0155MHAHB4'],
                alert_type: "alert",
                agenda: "\n    • item\n    • item1\n    • item2",
                extra: "N/A"
            }, 300000 - 1, true, new Date(1592900639642)), "<!channel>\nReminder: *Test Event* is occuring in *5 minutes*\nToday's test is located at: The Bay\nNotes: N/A\nReact with :watermelon: if you're coming!");
        });
        it('check other message', async function () {
            assert.deepEqual(await event.generateMessage(e, {
                type: "other",
                main_channel: "C014J93U4JZ",
                additional_channels: ['C0155MHAHB4'],
                alert_type: "alert",
                agenda: "\n    • item\n    • item1\n    • item2",
                extra: "N/A"
            }, 300000 - 1, false, new Date(1592900639642)), "<!channel>\nReminder: *Test Event* is occuring on *6/23/2020, 4:23:59 AM*\nNotes: N/A\nReact with :watermelon: if you're coming!");
        });
    });
}); 