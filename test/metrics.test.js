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
const Metrics = require("../lib/metrics");
const process = require("process");

describe("metrics", () => {
    it("timestamp", () => {
        const timestamp = Metrics.timestamp();
        assert.ok(typeof timestamp === "number");
    })
    it("start-empty", () => {
        const start = Metrics.start();
        assert.ok(typeof start.start === "number");
    })
    it("start-object", () => {
        const metrics = {};
        const start = Metrics.start(metrics);
        assert.ok(typeof start.start === "number");
        assert.strictEqual(metrics, start);
    })
    it("end", () => {
        const start = Metrics.start();
        const end = Metrics.end(start);
        assert.ok(typeof end.start === "number");
        assert.ok(typeof end.end === "number");
        assert.strictEqual(end.end - end.start, end.duration);
        assert.strictEqual(start, end);
    })
    it("openwhisk-empty", () => {
        assert.deepStrictEqual(Metrics.openwhisk(), {});
    })
    it("openwhisk-actionName-simple", () => {
        process.env.__OW_ACTION_NAME = "action";
        assert.deepStrictEqual(Metrics.openwhisk(), {
            actionName: "action"
        });
        delete process.env.__OW_ACTION_NAME;
    })
    it("openwhisk-actionName", () => {
        process.env.__OW_ACTION_NAME = "namespace/action";
        assert.deepStrictEqual(Metrics.openwhisk(), {
            actionName: "action"
        });
        delete process.env.__OW_ACTION_NAME;
    })
    it("openwhisk-namespace", () => {
        process.env.__OW_NAMESPACE = "namespace";
        assert.deepStrictEqual(Metrics.openwhisk(), {
            namespace: "namespace"
        });
        delete process.env.__OW_NAMESPACE;
    })
    it("openwhisk-activationId", () => {
        process.env.__OW_ACTIVATION_ID = "activationId";
        assert.deepStrictEqual(Metrics.openwhisk(), {
            activationId: "activationId"
        });
        delete process.env.__OW_ACTIVATION_ID;
    })
    it("summary-numbers", () => {
        const summary = Metrics.summary([1, 2, 3, 4, 5, 6, 7, 8]);
        // limit stdev to 3 digits after the dot for comparison
        summary.stdev = Math.round(summary.stdev * 1000) / 1000;
        assert.deepStrictEqual(summary, {
            max: 8,
            mean: 4.5,
            median: 4.5,
            min: 1,
            q1: 2.75,
            q3: 6.25,
            stdev: 2.449
        });
    })
    it("summary-objects", () => {
        const summary = Metrics.summary([{
            counter: 1,
            constant: 5
        }, {
            counter: 2,
            constant: 5
        }, {
            counter: 3,
            constant: 5
        }, {
            counter: 4,
            constant: 5
        }, {
            counter: 5,
            constant: 5
        }, {
            counter: 6,
            constant: 5
        }, {
            counter: 7,
            constant: 5
        }, {
            counter: 8,
            constant: 5
        }]);
        // limit stdev to 3 digits after the dot for comparison
        summary.counter.stdev = Math.round(summary.counter.stdev * 1000) / 1000;
        assert.deepStrictEqual(summary, {
            counter: {
                max: 8,
                mean: 4.5,
                median: 4.5,
                min: 1,
                q1: 2.75,
                q3: 6.25,
                stdev: 2.449
            },
            constant: {
                max: 5,
                mean: 5,
                median: 5,
                min: 5,
                q1: 5,
                q3: 5,
                stdev: 0
            }
        });
    })
})