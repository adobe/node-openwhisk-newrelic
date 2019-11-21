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

const FAKE_PARAMS = {
    newRelicEventsURL: `${NR_FAKE_BASE_URL}${NR_FAKE_EVENTS_PATH}`,
    newRelicApiKey: NR_FAKE_API_KEY,
};

const EXPECTED_METRICS = {
    actionName: "action",
    namespace: "namespace",
    activationId: "activationId",
	package: "package",
	timestamp:/\d+/

};

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

describe("AssetComputeMetrics", function() {

    beforeEach(function() {
        process.env.__OW_ACTION_NAME = "/namespace/package/action";
        process.env.__OW_NAMESPACE = "namespace";
        process.env.__OW_ACTIVATION_ID = "activationId";
        process.env.__OW_DEADLINE = Date.now() + 60000;
    })

    afterEach( function() {
        delete process.env.__OW_DEADLINE;
    })

    after( () => {
        nock.cleanAll();
    })


	it("constructor should log but not throw error if no url or api key", async function() {
		const metrics = new NewRelic();
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
		new NewRelic( Object.assign( FAKE_PARAMS, {
			actionTimeoutMetricsCb: () => {
				return { test: 'add_value'}
			}
		}));
		await sleep(600);
		assert.ok(nockSendEvent.isDone(), "metrics not properly sent");
	});

	it("sendMetrics - Timeout Metrics disabled", async function() {

		const nockSendEvent = expectNewRelicInsightsEvent({
			eventType: EVENT_TYPE,
			test: "value"
		});
		process.env.__OW_DEADLINE = Date.now() + 100;
		const metrics = new NewRelic( Object.assign( FAKE_PARAMS, {
			disableActionTimeout: true
		} ));
		await sleep(600);
		await metrics.send(EVENT_TYPE, { test: "value" });
		assert.ok(nockSendEvent.isDone(), "metrics not properly sent");
	});
});