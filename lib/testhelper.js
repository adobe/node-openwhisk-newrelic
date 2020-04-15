/*
Copyright 2020 Adobe. All rights reserved.
This file is licensed to you under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License. You may obtain a copy
of the License at http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software distributed under
the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
OF ANY KIND, either express or implied. See the License for the specific language
governing permissions and limitations under the License.
*/

'use strict';

const sendQueue = require("./queue");
const nock = require("nock");
const zlib = require('zlib');
const sleep = require('util').promisify(setTimeout);
const assert = require("assert");

// constants
const MOCK_BASE_URL = "http://newrelic.com";
const MOCK_URL_PATH = "/events";

const MOCK_URL = `${MOCK_BASE_URL}${MOCK_URL_PATH}`
const MOCK_API_KEY = "new-relic-api-key";

// custom nock scope for the mocked NewRelic service
let metricsNock;

/**
 * Helper for unit tests. Call this before each unit test.
 * Then after each test call NewRelic.afterEachTest().
 */
function beforeEachTest() {
    // send metrics almost immediately so that unit tests don't have to wait
    // too long - see metricsDone() waiting 100ms by default
    process.env.NEW_RELIC_SEND_INTERVAL_MS = 10;
}

/**
 * Helper for unit tests. Call this after each unit test.
 * Also make sure to call NewRelic.beforeEachTest() before each unit test..
 * Note this calls nock.cleanAll().
 */
function afterEachTest() {
    delete process.env.NEW_RELIC_SEND_INTERVAL_MS;

    // stop the queue so no pending timers that would block end of mocha execution
    sendQueue.stop();

    // nock does not support a way to just "clean" a single scope (metricsNock)
    // nock.removeInterceptor() or scope.persist(false) do not work the same way,
    // only cleanAll() gives the proper reset
    nock.cleanAll();

    metricsNock = undefined;
}

/**
 * Mock NewRelic insights HTTP API, using nock. Can be called
 * any number of times. Returns an array with the received metrics.
 */
function mockNewRelic() {
    const receivedMetrics = [];

    function gunzip(body) {
        body = Buffer.from(body, 'hex');
        body = zlib.gunzipSync(body).toString();
        return body;
    }

    metricsNock = nock(MOCK_BASE_URL)
        .filteringRequestBody((body) => gunzip(body))
        .matchHeader("x-insert-key", MOCK_API_KEY)
        .post(MOCK_URL_PATH, metrics => {
            receivedMetrics.push(...metrics);
            return true;
        })
        .reply(200, { uuid: `This is NewRelic Insights mocked by MetricsTestHelper` })
        .persist();

    return receivedMetrics;
}

/**
 * Call this in test cases after the action/work is done and wait
 * for metrics collection and sending has completed.
 * @param {Number} wait how long to wait in milliseconds. Defaults to 100.
 */
async function metricsDone(wait=100) {
    if (!metricsNock) {
        assert.fail("MetricsTestHelper.metricsDone() called without mockNewRelic() before");
    }
    await sleep(wait);
    assert.ok(metricsNock.isDone(), "Did not receive any metrics.");
}

/**
 * Asserts that the 'actual' object matches the 'expected' one. This does partial matches,
 * only the expected properties must be present and match, any other properties in
 * the actual object are ignored.
 *
 * Properties must either be strictly equal (assert.strictEqual()) or match a regular
 * expression if one is provided as property value in the expected object.
 *
 * If assertion fails, assert.AssertionError is thrown. Otherwise will do nothing.
 *
 * @param {Object} actual object to assert
 * @param {Object} expected expected object
 */
function assertObjectMatches(actual, expected, message="") {
    assert(typeof expected === "object" && expected !== null);
    assert(typeof actual === "object" && actual !== null);

    for (const key in expected) {
        const value = expected[key];
        if (value instanceof RegExp) {
            assert(value.test(actual[key]), `Property '${key}' does not match\nRegEx: ${value}\nActual: ${actual[key]}${message}`);
        } else {
            assert.strictEqual(actual[key], value, `Property '${key}' does not match${message}`);
        }
    }
}

/**
 * Asserts that the 'actualArray' matches the 'expectedArray', with each element in order
 * matching according to {@link assertObjectMatches}.
 *
 * If assertion fails, assert.AssertionError is thrown. Otherwise will do nothing.
 *
 * @param {Array} actualArray array to assert
 * @param {Array} expectedArray expected array
 */
function assertArrayMatches(actualArray, expectedArray) {
    assert(Array.isArray(expectedArray));
    assert(Array.isArray(actualArray));

    assert.equal(actualArray.length, expectedArray.length);

    for (let i = 0; i < expectedArray.length; i++) {
        assertObjectMatches(actualArray[i], expectedArray[i], `, from array element ${i}:\n\n${JSON.stringify(actualArray[i])}\n\nExpected object:\n\n${JSON.stringify(expectedArray[i])}\n`);
    }
}

/**
 * Asserts that the 'actualArray' contains the elements of 'expectedArray', in any order,
 * with elements matching according to {@link assertObjectMatches}.
 *
 * If assertion fails, assert.AssertionError is thrown. Otherwise will do nothing.
 *
 * @param {Array} actualArray array to assert
 * @param {Array} expectedArray expected array
 */
function assertArrayContains(actualArray, expectedArray) {
    assert(Array.isArray(expectedArray));
    assert(Array.isArray(actualArray));

    for (let i = 0; i < expectedArray.length; i++) {
        assert(
            actualArray.some((e) => {
                try {
                    assertObjectMatches(e, expectedArray[i]);
                    return true;
                } catch (err) {
                    return false;
                }
            }),
            `Did not find expected object ${i}:\n\n${JSON.stringify(expectedArray[i])}\n\nin array:\n\n${JSON.stringify(actualArray)}\n`
        );
    }
}

module.exports = {
    MOCK_URL,
    MOCK_API_KEY,
    MOCK_BASE_URL,
    MOCK_URL_PATH,
    beforeEachTest,
    afterEachTest,
    mockNewRelic,
    metricsDone,
    assertObjectMatches,
    assertArrayMatches,
    assertArrayContains
}
