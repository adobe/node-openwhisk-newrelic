/*************************************************************************
* ADOBE CONFIDENTIAL
* ___________________
*
* Copyright 2019 Adobe
* All Rights Reserved.
*
* NOTICE: All information contained herein is, and remains
* the property of Adobe and its suppliers, if any. The intellectual
* and technical concepts contained herein are proprietary to Adobe
* and its suppliers and are protected by all applicable intellectual
* property laws, including trade secret and copyright laws.
* Dissemination of this information or reproduction of this material
* is strictly forbidden unless prior written permission is obtained
* from Adobe.
**************************************************************************/

/* eslint-env mocha */
/* eslint-disable mocha/no-mocha-arrows */

"use strict";

const assert = require("assert");
const nock = require('nock');
const zlib = require('zlib');
const NewRelic = require('../lib/newrelic');
const { promisify } = require('util');
const sleep = promisify(setTimeout);

const NR_FAKE_BASE_URL = "http://newrelic.com";
const NR_FAKE_EVENTS_PATH = "/events";
const NR_FAKE_API_KEY = "new-relic-api-key";
const EVENT_TYPE = "myevent";

const FAKE_PARAMS = Object.freeze({
    newRelicEventsURL: `${NR_FAKE_BASE_URL}${NR_FAKE_EVENTS_PATH}`,
    newRelicApiKey: NR_FAKE_API_KEY,
});


const EXPECTED_METRICS = Object.freeze({
    actionName: "action",
    namespace: "namespace",
    activationId: "activationId",
	package: "package",
	timestamp:/\d+/
});

function gunzip(body) {
    body = Buffer.from(body, 'hex');
    body = zlib.gunzipSync(body).toString();
    console.log("New Relic received:", body);
    return body;
}

function expectNewRelicInsightsEvent(metrics, statusCode=200, defaultExpectedMetrics=true) {
    return nock(NR_FAKE_BASE_URL)
        .filteringRequestBody(gunzip)
        .matchHeader("x-insert-key", NR_FAKE_API_KEY)
        .post(NR_FAKE_EVENTS_PATH, {
            ...(defaultExpectedMetrics ? EXPECTED_METRICS : {}),
            ...metrics
        })
        .reply(statusCode, {});
}

describe("NewRelic", function() {

    beforeEach(function() {
        process.env.__OW_ACTION_NAME = "/namespace/package/action";
        process.env.__OW_NAMESPACE = "namespace";
        process.env.__OW_ACTIVATION_ID = "activationId";
        process.env.__OW_DEADLINE = Date.now() + 60000;
    });

    afterEach( function() {
		delete process.env.DISABLE_ACTION_TIMEOUT_METRIC;
        delete process.env.__OW_ACTION_NAME;
        delete process.env.__OW_NAMESPACE;
		delete process.env.__OW_ACTIVATION_ID;
        delete process.env.__OW_DEADLINE;
        nock.cleanAll();
    });

	it("constructor should log but not throw error if no url or api key", async function() {
		const metrics = new NewRelic();
		assert.ok(metrics);
		await metrics.send();
	});

	it("constructor should log but not throw error if url is blank string", async function() {
		const params = {
			newRelicEventsURL: '\n',
			newRelicApiKey: NR_FAKE_API_KEY,
		};

		const metrics = new NewRelic(params);
		assert.ok(metrics);
		await metrics.send();
	});

	it("constructor should log but not throw error if url is null", async function() {
		const params = {
			newRelicEventsURL: null,
			newRelicApiKey: NR_FAKE_API_KEY,
		};

		const metrics = new NewRelic(params);
		assert.ok(metrics);
		await metrics.send();
	});

	it("constructor should log but not throw error if api key is blank string", async function() {
		const params = {
			newRelicEventsURL: `${NR_FAKE_BASE_URL}${NR_FAKE_EVENTS_PATH}`,
			newRelicApiKey: '\n'
		};

		const metrics = new NewRelic(params);
		assert.ok(metrics);
		await metrics.send();
	});

	it("constructor should log but not throw error if api key is not a string", async function() {
		const params = {
			newRelicEventsURL: `${NR_FAKE_BASE_URL}${NR_FAKE_EVENTS_PATH}`,
			newRelicApiKey: 2
		};

		const metrics = new NewRelic(params);
		assert.ok(metrics);
		await metrics.send();
	});

	it("constructor should log but not throw error if api key is undefined", async function() {
		const params = {
			newRelicEventsURL: `${NR_FAKE_BASE_URL}${NR_FAKE_EVENTS_PATH}`,
		};

		const metrics = new NewRelic(params);
		assert.ok(metrics);
		await metrics.send();
	});

	it("sendMetrics", async function() {
		const nockSendEvent = expectNewRelicInsightsEvent({
			eventType: EVENT_TYPE,
			test: "value"
		});
		const metrics = new NewRelic(FAKE_PARAMS);
		await metrics.send(EVENT_TYPE, { test: "value" });
		assert.ok(nockSendEvent.isDone(), "metrics not properly sent");
		metrics.activationFinished();
	});

	it("sendMetrics - default metrics frozen object", async function() {
		const nockSendEvent = expectNewRelicInsightsEvent({
			eventType: EVENT_TYPE,
			test: "value",
			duration:2000
		});
		const defaultMetrics = Object.freeze({
			duration:2000
		});
		const metrics = new NewRelic(FAKE_PARAMS, defaultMetrics);
		await metrics.send(EVENT_TYPE, { test: "value" });
		assert.ok(nockSendEvent.isDone(), "metrics not properly sent");
		metrics.activationFinished();
	});

	it("sendMetrics - default metrics", async function() {
		const nockSendEvent = expectNewRelicInsightsEvent({
			eventType: EVENT_TYPE,
			test: "value",
			duration:2000
		});
		const defaultMetrics = {
			duration: 2000
		};
		const metrics = new NewRelic(FAKE_PARAMS, defaultMetrics);
		await metrics.send(EVENT_TYPE, { test: "value" });
		assert.ok(nockSendEvent.isDone(), "metrics not properly sent");
		metrics.activationFinished();
		assert.equal(Object.keys(defaultMetrics), "duration");
		assert.equal(defaultMetrics.duration, 2000);
	});

	it("sendMetrics - fail with 500 but not throw error", async function() {
		const nockSendEvent = expectNewRelicInsightsEvent({
			eventType: EVENT_TYPE,
			test: "value"
		}, 500);
		const metrics = new NewRelic(FAKE_PARAMS);
		await metrics.send(EVENT_TYPE, { test: "value" });
		assert.ok(nockSendEvent.isDone(), "metrics not properly sent");
		metrics.activationFinished();
	});

	it("sendMetrics - Timeout Metrics", async function() {
		const nockSendEvent = expectNewRelicInsightsEvent({
			eventType: "timeout"
		});

		process.env.__OW_DEADLINE = Date.now() + 1;
		new NewRelic( FAKE_PARAMS );
		await sleep(500);
		assert.ok(nockSendEvent.isDone(), "metrics not properly sent");
	});

	it("sendMetrics - Timeout Metrics with callback", async function() {
		const nockSendEvent = expectNewRelicInsightsEvent({
			eventType: "timeout",
			test: 'add_value'
		});

		process.env.__OW_DEADLINE = Date.now() + 100;
		new NewRelic( Object.assign( {}, FAKE_PARAMS, {
			actionTimeoutMetricsCb: () => {
				return { test: 'add_value'};
			}
		}));
		await sleep(600);
		assert.ok(nockSendEvent.isDone(), "metrics not properly sent");
	});

	it("sendMetrics - Timeout Metrics with callback, custom eventType", async function() {
		const nockSendEvent = expectNewRelicInsightsEvent({
			eventType: "custom",
			test: 'add_value'
		});

		process.env.__OW_DEADLINE = Date.now() + 100;
		new NewRelic( Object.assign( {}, FAKE_PARAMS, {
			actionTimeoutMetricsCb: () => {
				return {
					eventType: "custom",
					test: 'add_value'
				};
			}
		}));
		await sleep(600);
		assert.ok(nockSendEvent.isDone(), "metrics not properly sent");
	});

	it("sendMetrics - Timeout Metrics with invalid callback", async function() {
		const nockSendEvent = expectNewRelicInsightsEvent({
			eventType: "timeout"
		});

		process.env.__OW_DEADLINE = Date.now() + 100;
		new NewRelic( Object.assign( {}, FAKE_PARAMS, {
			actionTimeoutMetricsCb: { test: 'add_value'}
		}));
		await sleep(600);
		assert.ok(nockSendEvent.isDone(), "metrics not properly sent");
	});

	it("sendMetrics - Timeout Metrics disabled with options", async function() {
		const mustNotHappen = expectNewRelicInsightsEvent({
			eventType: "timeout"
		});
		process.env.__OW_DEADLINE = Date.now() + 100;
		new NewRelic( Object.assign( {}, FAKE_PARAMS, {
			disableActionTimeout: true
		} ));
		await sleep(600);
		assert.ok(!mustNotHappen.isDone(), "timeout metrics was sent even though it should be disabled");
	});

	it("sendMetrics - Timeout Metrics disabled with environment variable", async function() {
		const mustNotHappen = expectNewRelicInsightsEvent({
			eventType: "timeout"
		});

		process.env.DISABLE_ACTION_TIMEOUT_METRIC = true;

		process.env.__OW_DEADLINE = Date.now() + 100;
		 new NewRelic(FAKE_PARAMS);
		await sleep(600); // wait to past action timeout to make sure no timeout metrics are sent
		assert.ok(!mustNotHappen.isDone(), "timeout metrics was sent even though it should be disabled");
	});

	it("add()", async function() {
		expectNewRelicInsightsEvent({
			eventType: EVENT_TYPE,
			test: "value",
			added: "metric",
			anotherAdded: "metric"
		});
		expectNewRelicInsightsEvent({
			eventType: EVENT_TYPE,
			test: "value",
			added: "metric2",
			anotherAdded: "metric"
		});
		expectNewRelicInsightsEvent({
			eventType: EVENT_TYPE,
			added: "metric3",
			anotherAdded: "metric"
		});

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

		assert.ok(nock.isDone(), "metrics not properly sent");
		metrics.activationFinished();
	});

	it("sendMetrics - Timeout Metrics with add()", async function() {
		expectNewRelicInsightsEvent({
			eventType: "timeout",
			added: "metric"
		});

		process.env.__OW_DEADLINE = Date.now() + 1;
		const metrics = new NewRelic( FAKE_PARAMS );
		metrics.add({added: "metric"});
		await sleep(600);
		assert.ok(nock.isDone(), "metrics not properly sent");
	});

});