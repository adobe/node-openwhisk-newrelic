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

'use strict';

const dl = require('datalib');
const interval = require('interval-promise');

/**
 * Function called at a regular interval to gather metrics. 
 * 
 * The function has no arguments, but returns metrics that are gathered and 
 * then summarized once {@link Sampler#finish} is called.
 * 
 * @callback SampleFunction
 * @returns {Object} Object with metrics
 */

/**
 * Sampler that invokes a sample function at an interval. Metrics returned by the sample
 * function are summarized. 
 */
class Sampler {

    /**
     * Construct a sampler around the given sample function.
     * 
     * @param {SampleFunction} sampleFunction Sample function called a the given interval
     * @param {number} [intervalTimeout=100] Interval in ms to call sample function
     */
    constructor(sampleFunction, intervalTimeout) {
        this.samples = [];
        this.sampleFunction = sampleFunction;
        this.stopInterval = false;
        this.interval = intervalTimeout || 100;
        this.intervalPromise = Promise.resolve();
        const self = this;
        this.intervalPromise = interval(async (_iteration, stop) => {
            if (self.stopInterval) {
                stop();
            } else {
                await self.sample();
            }
        }, this.interval);
    }

    /**
     * Gather a sample from the sample function
     * 
     * @returns {Promise} resolves when the sample is available and added
     */
    async sample() {
        const sample = await this.sampleFunction();
        this.samples.push(sample);
    }

    /**
     * Finish up sampling, gather up metrics
     * 
     * @returns {Promise} resolves to the metrics
     */
    async finish() {
        // stop interval timeout
        this.stopInterval = true;
        await this.intervalPromise;

        // gather metrics for all number fields
        const metrics = {}
        const summary = dl.summary(this.samples)
        for (const x of summary) {
            if (x.type === 'number') {
                metrics[x.field] = {
                    min: x.min,
                    max: x.max,
                    mean: x.mean,
                    stdev: x.stdev,
                    median: x.median,
                    q1: x.q1,
                    q3: x.q3
                }
            }
        }
        return metrics;
    }

}

module.exports = {
    Sampler
}
