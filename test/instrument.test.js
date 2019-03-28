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
const { instrument } = require("../lib/instrument");
const Metrics = require("../lib/metrics");

function asyncTimeout(ms) {
    return new Promise(resolve => {
        setTimeout(() => {
            resolve(ms)
        }, ms);
    })
}

describe("instrument", () => {
    it("sync-func", async () => {
        const metrics = {};
        const result = await instrument(arg => arg, metrics).execute(100);
        assert.strictEqual(result, 100);
        assert.deepStrictEqual(Object.getOwnPropertyNames(metrics), ["start", "end", "duration"]);
        assert.strictEqual(metrics.end - metrics.start, metrics.duration);
    });
    it("sync-func-name", async () => {
        const metrics = {};
        const result = await instrument(arg => arg, metrics, "name").execute(100);
        assert.strictEqual(result, 100);
        assert.deepStrictEqual(Object.getOwnPropertyNames(metrics), ["name"]);
        assert.deepStrictEqual(Object.getOwnPropertyNames(metrics.name), ["start", "end", "duration"]);
        assert.strictEqual(metrics.name.end - metrics.name.start, metrics.name.duration);
    });
    it("sync-func-name-error", async () => {
        const metrics = {};
        try {
            await instrument(() => {
                throw Error("error message")
            }, metrics, "name").execute(100);
            assert.fail("line should not be reached");
        } catch (e) {
            assert.ok(e);
        }
        const flatten = Metrics.flatten(metrics);
        assert.deepStrictEqual(Object.getOwnPropertyNames(flatten), [
            "name_start", "name_end", "name_duration",
            "error_message", "error_name"
        ]);
        assert.strictEqual(flatten.name_end - flatten.name_start, flatten.name_duration);
        assert.strictEqual(flatten.error_message, "error message");
        assert.strictEqual(flatten.error_name, "Error");
    });
    it("async-func", async () => {
        const metrics = {};
        const result = await instrument(asyncTimeout, metrics).execute(100);
        assert.strictEqual(result, 100);
        assert.deepStrictEqual(Object.getOwnPropertyNames(metrics), ["start", "end", "duration"]);
        assert.strictEqual(metrics.end - metrics.start, metrics.duration);
    });
    it("async-func-name", async () => {
        const metrics = {};
        const result = await instrument(asyncTimeout, metrics, "name").execute(100);
        assert.strictEqual(result, 100);
        assert.deepStrictEqual(Object.getOwnPropertyNames(metrics), ["name"]);
        assert.deepStrictEqual(Object.getOwnPropertyNames(metrics.name), ["start", "end", "duration"]);
        assert.strictEqual(metrics.name.end - metrics.name.start, metrics.name.duration);
    });
    it("sync-worker-metrics-error", async () => {
        const metrics = {};
        try {
            await instrument({
                execute: () => {
                    throw Error("error message")
                },
                metrics: (error) => {
                    return { error }
                }
            }, metrics, "name").execute(100);
            assert.fail("line should not be reached");
        } catch (e) {
            assert.ok(e);
        }
        const flatten = Metrics.flatten(metrics);
        assert.deepStrictEqual(Object.getOwnPropertyNames(flatten), [
            "name_start", "name_end", "name_duration", "name_error_message", "name_error_name",
            "error_message", "error_name"
        ]);
        assert.strictEqual(flatten.name_end - flatten.name_start, flatten.name_duration);
        assert.strictEqual(flatten.name_error_message, "error message");
        assert.strictEqual(flatten.name_error_name, "Error");
        assert.strictEqual(flatten.error_message, "error message");
        assert.strictEqual(flatten.error_name, "Error");
    });
    it("async-worker-metrics-error", async () => {
        const metrics = {};
        try {
            await instrument({
                execute: async () => {
                    throw Error("error message")
                },
                metrics: async (error) => {
                    return { error }
                }
            }, metrics, "name").execute(100);
            assert.fail("line should not be reached");
        } catch (e) {
            assert.ok(e);
        }
        const flatten = Metrics.flatten(metrics);
        assert.deepStrictEqual(Object.getOwnPropertyNames(flatten), [
            "name_start", "name_end", "name_duration", "name_error_message", "name_error_name",
            "error_message", "error_name"
        ]);
        assert.strictEqual(flatten.name_end - flatten.name_start, flatten.name_duration);
        assert.strictEqual(flatten.name_error_message, "error message");
        assert.strictEqual(flatten.name_error_name, "Error");
        assert.strictEqual(flatten.error_message, "error message");
        assert.strictEqual(flatten.error_name, "Error");
    });
    it("sync-worker-metrics-result", async () => {
        const metrics = {};
        const result = await instrument({
            execute: arg => arg,
            metrics: (_, result) => {
                return { result }
            }
        }, metrics).execute(100);
        assert.strictEqual(result, 100);
        assert.deepStrictEqual(Object.getOwnPropertyNames(metrics), ["start", "end", "duration", "result"]);
        assert.strictEqual(metrics.result, 100);
    });
    it("async-worker-metrics-result", async () => {
        const metrics = {};
        const result = await instrument({
            execute: async arg => arg,
            metrics: async (_, result) => {
                return { result }
            }
        }, metrics).execute(100);
        assert.strictEqual(result, 100);
        assert.deepStrictEqual(Object.getOwnPropertyNames(metrics), ["start", "end", "duration", "result"]);
        assert.strictEqual(metrics.result, 100);
    });
});
