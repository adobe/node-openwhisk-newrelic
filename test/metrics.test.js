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
})