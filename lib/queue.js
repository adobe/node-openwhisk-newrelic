/*
 * Copyright 2020 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */


'use strict';

const Metrics = require('./metrics');
const fetch = require('node-fetch');
const { promisify } = require('util');
const gzip = promisify(require('zlib').gzip);

// Do not reuse this user agent for anything other than sending metrics to newrelic insights.
// This user agent value is used to identify those requests in order to ignore them from
// http request metrics in lib/probe/http-client.js
const USER_AGENT = "adobe-openwhisk-newrelic/1.0";

const DEFAULT_SEND_INTERVAL_MS = 10000; // 10 sec

// New Relic Insights has a limit of 1 MB for one POST request,
// so the number of events that can fit in depend on their number
// of attributes and their value lengths. We go conservatively
// and limit at 50, which gives us 20kb of data per event
// https://docs.newrelic.com/docs/insights/insights-data-sources/custom-data/insights-custom-data-requirements-limits
const MAX_EVENTS = 50;

const endpoint = {
    url: undefined,
    apiKey: undefined
};

// metric events to send
const queue = [];

// id for the regular send interval timer
let sendTimer;

async function send(metrics, immediately) {
    queue.push(metrics);
    if (immediately) {
        await sendQueue();
    }
}

function start(url, apiKey, sendInterval) {
    endpoint.url = url;
    endpoint.apiKey = apiKey;

    if (!sendTimer) {
        sendInterval = sendInterval || process.env.NEW_RELIC_SEND_INTERVAL_MS || DEFAULT_SEND_INTERVAL_MS;
        sendTimer = setInterval(sendQueue, sendInterval);
    }
}

function stop() {
    if (sendTimer) {
        if (queue && queue.length > 0) {
            console.log(`Stopping send queue with ${queue.length} metric events left in it`);
            queue.length = 0;
        }
        clearInterval(sendTimer);
        sendTimer = undefined;
    }
}

async function sendQueue() {
    // nothing to do if queue is empty
    if (!queue || queue.length === 0) {
        return;
    }

    const batch = queue.splice(0, MAX_EVENTS);
    // ensure to immediately run again for handling the remaining queue
    if (queue.length > 0) {
        setImmediate(sendQueue);
    }

    try {
        console.log(`Sending ${batch.length} queued metrics to ${endpoint.url}`);
        // flatten metrics as newrelic only accepts key = literal values, no nested objects
        const array = batch.map(m => Metrics.flatten(m));
        // POST to https://insights-collector.newrelic.com/....
        const response = await fetch(endpoint.url, {
            method: "POST",
            headers: {
                "X-Insert-Key": endpoint.apiKey,
                "Content-Type": "application/json",
                "Content-Encoding": "gzip",
                "User-Agent": USER_AGENT
            },
            body: await gzip(JSON.stringify(array))
        });

        if (response.status !== 200) {
            console.log(`Error sending NewRelic metrics with status ${response.status}: ${response.statusText}`);
            console.error("Metrics not sent: ", batch);
        } else {
            console.log(`Metrics successfully sent to NewRelic, response: ${JSON.stringify(await response.json())}`);
        }

    } catch (e) {
        console.error(`Unable to send metrics to NewRelic: ${e.message}`);
        console.error("Metrics not sent: ", batch);
    }
}

module.exports = {
    start,
    stop,
    send,
    USER_AGENT
};