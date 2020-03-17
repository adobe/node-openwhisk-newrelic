/**
 * ADOBE CONFIDENTIAL
 * ___________________
 *
 *  Copyright 2020 Adobe
 *  All Rights Reserved.
 *
 * NOTICE:  All information contained herein is, and remains
 * the property of Adobe and its suppliers, if any. The intellectual
 * and technical concepts contained herein are proprietary to Adobe
 * and its suppliers and are protected by all applicable intellectual
 * property laws, including trade secret and copyright laws.
 * Dissemination of this information or reproduction of this material
 * is strictly forbidden unless prior written permission is obtained
 * from Adobe.
 */

'use strict';

const NewRelic = require("./newrelic");
const sendQueue = require("./queue");
const nock = require("nock");
const zlib = require('zlib');
const sleep = require('util').promisify(setTimeout);
const assert = require("assert");

/**
 * Helper for unit tests. Call this before each unit test.
 * Then after each test call NewRelic.__afterTest().
 */
function beforeTest() {
}

/**
 * Helper for unit tests. Call this after each unit test.
 * Also make sure to call NewRelic.__beforeTest() before each unit test..
 * Note this calls nock.cleanAll()
 */
function afterTest() {
    NewRelic.stopInstrument();
    sendQueue.stop(true);
    nock.cleanAll();
}

const MOCK_BASE_URL = "http://newrelic.com";
const MOCK_URL_PATH = "/events";

const MOCK_URL = `${MOCK_BASE_URL}${MOCK_URL_PATH}`
const MOCK_API_KEY = "new-relic-api-key";

/**
 * Mock NewRelic insights HTTP API, using nock. Can be called
 * any number of times. Returns an array with the received metrics.
 */
function mockNewRelic(sendIntervalMs=10) {
    // send metrics almost immediately so that unit tests don't have to wait
    // too long - see metricsDone() waiting 100ms by default
    process.env.NEW_RELIC_SEND_INTERVAL_MS = sendIntervalMs;

    const receivedMetrics = [];

    function gunzip(body) {
        body = Buffer.from(body, 'hex');
        body = zlib.gunzipSync(body).toString();
        return body;
    }

    nock(MOCK_BASE_URL)
        .filteringRequestBody((body) => gunzip(body))
        .matchHeader("x-insert-key", MOCK_API_KEY)
        .post(MOCK_URL_PATH, metrics => {
            receivedMetrics.push(...metrics);
            return true;
        })
        .reply(200, {})
        .persist();

    return receivedMetrics;
}

/**
 * Call this in test cases after the action/work is done and wait
 * for metrics collection and sending has completed.
 * @param {Number} wait how long to wait in milliseconds. Defaults to 100.
 */
async function metricsDone(wait=100) {
    await sleep(wait);
    assert.ok(nock.isDone(), "Did not receive any metrics. Timeout too short?");
}

module.exports = {
    MOCK_URL,
    MOCK_API_KEY,
    MOCK_BASE_URL,
    MOCK_URL_PATH,
    beforeTest,
    afterTest,
    mockNewRelic,
    metricsDone
}
