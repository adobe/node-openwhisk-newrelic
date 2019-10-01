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
const { Sampler } = require("../lib/sampler");
const { promisify } = require("util");
const setTimeoutPromise = promisify(setTimeout);

function sampleFunction() {
    let counter = 0;
    return () => {
        return ++counter;
    }
}

describe("sampler", () => {
    it("counter-manual-8", async () => {
        const sampler = new Sampler(sampleFunction(), 0);
        for (let i = 0; i < 8; ++i) {
            await sampler.sample();
        }
        const summary = await sampler.finish();
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
    it("counter-auto-8", async () => {
        const sampler = new Sampler(sampleFunction(), 200);
        await setTimeoutPromise(1700);
        const summary = await sampler.finish();
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
    });
});
