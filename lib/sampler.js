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

class Sampler {

    /**
     * Construct a sampler around the given sample function.
     * 
     * @param {*} sampleFunction 
     * @param {*} options 
     */
    constructor(sampleFunction, options) {
        this.samples = [];
        this.sampleFunction = sampleFunction;
        this.stopInterval = false;
        this.intervalTimeout = Promise.resolve();
        if (options && options.interval) {
            const self = this;
            this.intervalTimeout = interval(async (_iteration, stop) => {
                if (self.stopInterval) {
                    stop();
                } else {
                    await self.sample();
                }
            }, options.interval);
        }
    }

    /**
     * Gather a sample from the sample function
     * 
     * @returns {Promise} resolves when the sample is available and added
     */
    async sample() {
        const sample = await Promise.resolve(this.sampleFunction());
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
        await this.intervalTimeout;

        // gather metrics, assume all fields are numbers
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
