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

/* eslint-env mocha */

"use strict";

const NewRelic = require('../lib/newrelic');
const MetricsTestHelper = require('../lib/testhelper');

const assert = require("assert");
const nock = require('nock');
const sleep = require('util').promisify(setTimeout);
const fetch = require("node-fetch");

const EVENT_TYPE = "myevent";

const FAKE_PARAMS = Object.freeze({
    newRelicEventsURL: MetricsTestHelper.MOCK_URL,
    newRelicApiKey: MetricsTestHelper.MOCK_API_KEY
});

const EXPECTED_METRICS = Object.freeze({
    actionName: "action",
    namespace: "namespace",
    activationId: "activationId",
    package: "package",
    timestamp: /\d+/
});

describe("NewRelic", function() {

    beforeEach(function() {
        process.env.__OW_ACTION_NAME = "/namespace/package/action";
        process.env.__OW_NAMESPACE = "namespace";
        process.env.__OW_ACTIVATION_ID = "activationId";
        process.env.__OW_DEADLINE = Date.now() + 60000;

        MetricsTestHelper.beforeEachTest();

        // wrap all tests with the required instrumentation
        this.currentTest.fn = NewRelic.instrument(this.currentTest.fn);
    });

    afterEach(function() {
        delete process.env.DISABLE_ACTION_TIMEOUT_METRIC;
        delete process.env.__OW_ACTION_NAME;
        delete process.env.__OW_NAMESPACE;
        delete process.env.__OW_ACTIVATION_ID;
        delete process.env.__OW_DEADLINE;

        MetricsTestHelper.afterEachTest();
    });

    describe("constructor", function() {

        it("constructor should log but not throw error if no url or api key", async function() {
            const metrics = new NewRelic();
            assert.ok(metrics);
            await metrics.send();
        });

        it("constructor should log but not throw error if url is blank string", async function() {
            const params = {
                newRelicEventsURL: '\n',
                newRelicApiKey: MetricsTestHelper.MOCK_API_KEY
            };

            const metrics = new NewRelic(params);
            assert.ok(metrics);
            await metrics.send();
        });

        it("constructor should log but not throw error if url is null", async function() {
            const params = {
                newRelicEventsURL: null,
                newRelicApiKey: MetricsTestHelper.MOCK_API_KEY
            };

            const metrics = new NewRelic(params);
            assert.ok(metrics);
            await metrics.send();
        });

        it("constructor should log but not throw error if api key is blank string", async function() {
            const params = {
                newRelicEventsURL: MetricsTestHelper.MOCK_URL,
                newRelicApiKey: '\n'
            };

            const metrics = new NewRelic(params);
            assert.ok(metrics);
            await metrics.send();
        });

        it("constructor should log but not throw error if api key is not a string", async function() {
            const params = {
                newRelicEventsURL: MetricsTestHelper.MOCK_URL,
                newRelicApiKey: 2
            };

            const metrics = new NewRelic(params);
            assert.ok(metrics);
            await metrics.send();
        });

        it("constructor should log but not throw error if api key is undefined", async function() {
            const params = {
                newRelicEventsURL: MetricsTestHelper.MOCK_URL
            };

            const metrics = new NewRelic(params);
            assert.ok(metrics);
            await metrics.send();
        });
    });

    describe("send()", function() {

        it("sendMetrics", async function() {
            const receivedMetrics = MetricsTestHelper.mockNewRelic();

            const metrics = new NewRelic(FAKE_PARAMS);
            await metrics.send(EVENT_TYPE, { test: "value" });
            await metrics.activationFinished();

            await MetricsTestHelper.metricsDone();
            MetricsTestHelper.assertArrayMatches(receivedMetrics, [{
                ...EXPECTED_METRICS,
                eventType: EVENT_TYPE,
                test: "value"
            }]);
        });

        it("sendMetrics - default metrics frozen object", async function() {
            const receivedMetrics = MetricsTestHelper.mockNewRelic();

            const defaultMetrics = Object.freeze({
                duration: 2000
            });
            const metrics = new NewRelic(FAKE_PARAMS, defaultMetrics);
            await metrics.send(EVENT_TYPE, { test: "value" });
            await metrics.activationFinished();

            await MetricsTestHelper.metricsDone();
            MetricsTestHelper.assertArrayMatches(receivedMetrics, [{
                ...EXPECTED_METRICS,
                eventType: EVENT_TYPE,
                test: "value",
                duration: 2000
            }]);
        });

        it("sendMetrics - default metrics", async function() {
            const receivedMetrics = MetricsTestHelper.mockNewRelic();

            const defaultMetrics = {
                duration: 2000
            };
            const metrics = new NewRelic(FAKE_PARAMS, defaultMetrics);
            await metrics.send(EVENT_TYPE, { test: "value" });
            await metrics.activationFinished();

            await MetricsTestHelper.metricsDone();
            MetricsTestHelper.assertArrayMatches(receivedMetrics, [{
                ...EXPECTED_METRICS,
                eventType: EVENT_TYPE,
                test: "value",
                duration: 2000
            }]);
            assert.equal(Object.keys(defaultMetrics), "duration");
            assert.equal(defaultMetrics.duration, 2000);
        });

        it("sendMetrics - fail with 500 but not throw error", async function() {
            const failedMetricsNock = nock(MetricsTestHelper.MOCK_BASE_URL)
                .post(MetricsTestHelper.MOCK_URL_PATH)
                .reply(500)

            const metrics = new NewRelic(FAKE_PARAMS);
            await metrics.send(EVENT_TYPE, { test: "value" });
            await metrics.activationFinished();

            await sleep(100);
            failedMetricsNock.done();
        });

        it("sendMetrics - request throws error but it is handled", async function() {
            const failedMetricsNock = nock(MetricsTestHelper.MOCK_BASE_URL)
                .post(MetricsTestHelper.MOCK_URL_PATH)
                .replyWithError("faked error");

            const metrics = new NewRelic({
                ...FAKE_PARAMS,
            });
            await metrics.send(EVENT_TYPE, { test: "value" });
            await metrics.activationFinished();

            await sleep(100);
            failedMetricsNock.done();
        });

        it("sendMetrics - for concurrent activations", async function() {
            const receivedMetrics = MetricsTestHelper.mockNewRelic();

            // simulate a bunch of concurrent activations
            const ACTIVATION_COUNT = 200;

            const activations = [];
            for (let i = 0; i < ACTIVATION_COUNT; i++) {
                activations[i] = NewRelic.instrument(async () => {
                    // add some random separation of the different activations
                    await sleep(Math.random() * 10);

                    const metrics = new NewRelic({
                        ...FAKE_PARAMS,
                        sendIntervalMs: 500
                    });
                    metrics.add({
                        activationId: i
                    });

                    await metrics.send(EVENT_TYPE, { test: "value" });
                    await metrics.activationFinished();
                })();
            }
            await Promise.all(activations);

            await MetricsTestHelper.metricsDone(500);

            assert.equal(receivedMetrics.length, ACTIVATION_COUNT);
            receivedMetrics.forEach(m => {
                assert.equal(m.eventType, EVENT_TYPE);
                MetricsTestHelper.assertObjectMatches(m, {
                    actionName: "action",
                    namespace: "namespace",
                    package: "package",
                    timestamp: /\d+/
                });
            });
            // make sure all activation ids are found, but could be any order
            for (let i = 0; i < ACTIVATION_COUNT; i++) {
                assert(receivedMetrics.some(m => m.activationId === i), `did not find activation id ${i}`);
            }
        });
    });

    it("add()", async function() {
        const receivedMetrics = MetricsTestHelper.mockNewRelic();

        const metrics = new NewRelic(FAKE_PARAMS);
        // add metrics
        metrics.add({
            added: "metric",
            anotherAdded: "metric"
        });
        await metrics.send(EVENT_TYPE, { test: "value" });

        // overwrite previously added metrics with newly added metrics
        metrics.add({added: "metric2"});
        await metrics.send(EVENT_TYPE, { test: "value" });

        // overwrite previously added metrics via send() metrics
        await metrics.send(EVENT_TYPE, {added: "metric3"});

        await metrics.activationFinished();

        await MetricsTestHelper.metricsDone();
        MetricsTestHelper.assertArrayMatches(receivedMetrics, [{
            ...EXPECTED_METRICS,
            eventType: EVENT_TYPE,
            test: "value",
            added: "metric",
            anotherAdded: "metric"
        },{
            ...EXPECTED_METRICS,
            eventType: EVENT_TYPE,
            test: "value",
            added: "metric2",
            anotherAdded: "metric"
        },{
            ...EXPECTED_METRICS,
            eventType: EVENT_TYPE,
            added: "metric3",
            anotherAdded: "metric"
        }]);
});

    it("get()", async function() {

        const metrics = new NewRelic({...FAKE_PARAMS, disableActionTimeout: true });
        // add metrics
        metrics.add({
            added: "metric",
            anotherAdded: "metric"
        });

        const m = metrics.get();
        assert.equal(m.added, "metric");
        assert.equal(m.anotherAdded, "metric");
    });

    describe("timeout metrics", function() {

        it("timeout metrics", async function() {
            const receivedMetrics = MetricsTestHelper.mockNewRelic();

            process.env.__OW_DEADLINE = Date.now() + 100;
            new NewRelic( FAKE_PARAMS );

            await MetricsTestHelper.metricsDone();
            MetricsTestHelper.assertArrayMatches(receivedMetrics, [{
                ...EXPECTED_METRICS,
                eventType: "timeout",
                duration: /\d+/
            }]);
        });

        it("timeout metrics with callback", async function() {
            const receivedMetrics = MetricsTestHelper.mockNewRelic();

            process.env.__OW_DEADLINE = Date.now() + 100;
            new NewRelic( {  ...FAKE_PARAMS, actionTimeoutMetricsCb: () => {
                    return { test: 'add_value'};
                }});

            await MetricsTestHelper.metricsDone(300);
            MetricsTestHelper.assertArrayMatches(receivedMetrics, [{
                ...EXPECTED_METRICS,
                eventType: "timeout",
                test: 'add_value'
            }]);
        });

        it("timeout metrics with callback, custom eventType", async function() {
            const receivedMetrics = MetricsTestHelper.mockNewRelic();

            process.env.__OW_DEADLINE = Date.now() + 100;
            new NewRelic( {  ...FAKE_PARAMS, actionTimeoutMetricsCb: () => {
                    return {
                        eventType: "custom",
                        test: 'add_value'
                    };
                }});

            await MetricsTestHelper.metricsDone(300);
            MetricsTestHelper.assertArrayMatches(receivedMetrics, [{
                ...EXPECTED_METRICS,
                eventType: "custom",
                test: 'add_value'
            }]);
        });

        it("timeout metrics with invalid callback", async function() {
            const receivedMetrics = MetricsTestHelper.mockNewRelic();

            process.env.__OW_DEADLINE = Date.now() + 100;
            new NewRelic( {  ...FAKE_PARAMS, actionTimeoutMetricsCb: { test: 'add_value'}});

            await MetricsTestHelper.metricsDone(300);
            MetricsTestHelper.assertArrayMatches(receivedMetrics, [{
                ...EXPECTED_METRICS,
                eventType: "timeout",
                duration: /\d+/
            }]);
        });

        it("timeout metrics disabled with options", async function() {
            const mustNotHappen = nock(MetricsTestHelper.MOCK_BASE_URL)
                .post(MetricsTestHelper.MOCK_URL_PATH)
                .reply(200)

            process.env.__OW_DEADLINE = Date.now() + 100;
            new NewRelic( {  ...FAKE_PARAMS, disableActionTimeout: true });
            await sleep(300);
            assert.ok(!mustNotHappen.isDone(), "timeout metrics was sent even though it should be disabled");
        });

        it("timeout metrics disabled with environment variable", async function() {
            const mustNotHappen = nock(MetricsTestHelper.MOCK_BASE_URL)
                .post(MetricsTestHelper.MOCK_URL_PATH)
                .reply(200)

            process.env.DISABLE_ACTION_TIMEOUT_METRIC = true;

            process.env.__OW_DEADLINE = Date.now() + 100;
            new NewRelic(FAKE_PARAMS);
            await sleep(300); // wait to past action timeout to make sure no timeout metrics are sent
            assert.ok(!mustNotHappen.isDone(), "timeout metrics was sent even though it should be disabled");
        });

        it("timeout metrics with add()", async function() {
            const receivedMetrics = MetricsTestHelper.mockNewRelic();

            process.env.__OW_DEADLINE = Date.now() + 100;
            const metrics = new NewRelic( FAKE_PARAMS );
            metrics.add({added: "metric"});

            await MetricsTestHelper.metricsDone(300);
            MetricsTestHelper.assertArrayMatches(receivedMetrics, [{
                ...EXPECTED_METRICS,
                eventType: "timeout",
                added: "metric",
                duration: /\d+/
            }]);
        });

        it("send all queued metrics on timeout", async function() {
            const receivedMetrics = MetricsTestHelper.mockNewRelic();

            process.env.__OW_DEADLINE = Date.now() + 100;
            const metrics = new NewRelic( FAKE_PARAMS );

            await metrics.send(EVENT_TYPE, { test: "value" });
            await metrics.send(EVENT_TYPE, { test: "value2" });

            await MetricsTestHelper.metricsDone(300);
            // order is not required
            MetricsTestHelper.assertArrayContains(receivedMetrics, [{
                ...EXPECTED_METRICS,
                eventType: EVENT_TYPE,
                test: "value"
            },{
                ...EXPECTED_METRICS,
                eventType: EVENT_TYPE,
                test: "value2"
            },{
                ...EXPECTED_METRICS,
                eventType: "timeout",
                duration: /\d+/
            }]);
        });
    });

    describe("instrument", function() {
        it("instrument() should wrap action main", async function() {

            function main(params) {
                assert.equal(typeof params, "object");

                // passed in params
                assert.equal(params.key, "value");

                return { ok: true};
            }

            const wrappedMain = NewRelic.instrument(main);

            const result = await wrappedMain({
                key: "value"
            });
            assert.equal(result.ok, true)
        });
    });

    describe("http metrics", function() {
        it("should send metric for http requests", async function() {
            nock(`http://example.com`).get("/test").reply(200, {ok: true});
            const receivedMetrics = MetricsTestHelper.mockNewRelic();

            const metrics = new NewRelic( FAKE_PARAMS );
            await fetch("http://example.com/test")
            await metrics.activationFinished();

            await MetricsTestHelper.metricsDone();
            MetricsTestHelper.assertArrayMatches(receivedMetrics, [{
                ...EXPECTED_METRICS,
                eventType: "http",
                url: "http://example.com/test",
                responseCode: 200
            }]);
        });

        it("should send http metrics for concurrent activations", async function() {
            nock(`http://example.com`).get("/test").reply(200, {ok: true}).persist();
            const receivedMetrics = MetricsTestHelper.mockNewRelic();

            // simulate a bunch of concurrent activations
            const ACTIVATION_COUNT = 200;

            const activations = [];
            for (let i = 0; i < ACTIVATION_COUNT; i++) {
                activations[i] = NewRelic.instrument(async () => {
                    // add some random separation of the different activations
                    await sleep(Math.random() * 10);

                    const metrics = new NewRelic({
                        ...FAKE_PARAMS,
                        sendIntervalMs: 500
                    });
                    metrics.add({
                        activationId: i
                    });

                    // each makes a http request
                    await fetch("http://example.com/test");
                    await fetch("http://example.com/test");
                    await fetch("http://example.com/test");
                    await fetch("http://example.com/test");

                    await metrics.activationFinished();
                })();
            }
            await Promise.all(activations);

            await MetricsTestHelper.metricsDone(700);

            assert.equal(receivedMetrics.length, ACTIVATION_COUNT * 4);
            receivedMetrics.forEach(m => {
                MetricsTestHelper.assertObjectMatches(m, {
                    actionName: "action",
                    namespace: "namespace",
                    package: "package",
                    timestamp: /\d+/,

                    eventType: "http",
                    url: "http://example.com/test",
                    responseCode: 200
                });
            });
            // make sure all activation ids are found, but could be any order
            for (let i = 0; i < ACTIVATION_COUNT; i++) {
                assert(receivedMetrics.some(m => m.activationId === i), `did not find activation id ${i}`);
            }
        });
    });
});