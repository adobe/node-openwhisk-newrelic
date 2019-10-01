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

const assert = require('assert');
const { Sampler } = require('./sampler');
const Metrics = require('./metrics');

/** @typedef {import('./sampler').SampleFunction} SampleFunction */

class Instrument {

    /**
     * Function to execute and gather metrics for. Allowed to be 
     * synchronous or asynchronous and return a Promise. 
     * 
     * @callback ExecuteFunction
     */
    /**
     * Called after the execute function to gather additional metrics beside
     * the start, end, and duration. Allowed to be synchronous or asynchronous.
     * 
     * @callback MetricsFunction
     * @param {Error} error Error thrown from the execute function
     * @param {Object} result Result returned from the execute function
     * @param {Object} metrics Metrics gathered so far
     * @param {Worker} worker Worker 
     */
    /**
     * Function that returns the sample interval in milliseconds.
     * Allowed to be synchronous or asynchronous.
     * 
     * @callback SampleIntervalFunction
     * @returns {Number} Sample interval in milliseconds
     */
    /**
     * @typedef Worker
     * @type {object}
     * @property {SampleFunction} sample Sample function called while execute() is running
     * @property {SampleIntervalFunction} [sampleInterval=100] Sample interval in milliseconds
     * @property {ExecuteFunction} execute Function to execute and gather metrics for
     * @property {MetricsFunction} metrics
     */
    /**
     * Instrument a given function in order to gather metrics.
     * 
     * The function can be named, which will result in the metrics to be put
     * under metrics[name] rather than at the root. This allows multiple instrumented
     * functions to put their metrics in a single result. 
     * 
     * @param {Function|Worker} func Function to be instrument
     * @param {Object} metrics Object where to store the metrics
     * @param {String} name Optional key under which to store the metrics
     */
    constructor(func, metrics, name) {
        if (typeof func === 'function') {
            this.func = {
                execute: func
            }
        } else {
            assert.ok(func && func.execute);
            this.func = func;
        }
        assert.ok(metrics);
        this.metrics = metrics;
        this.name = name;
    }

    /**
     * Execute the instrumented function while gathering metrics.
     * 
     * Behavior:
     * - Synchronous instrumented functions are turned in to async functions
     * - Arguments are passed through to the instrumented function
     * - Results from the instrumented function are returned 
     * - Thrown errors are recorded and re-thrown 
     */
    async execute(...args) {
        // put metrics either at the top-level or under a given key
        if (this.name && !this.metrics[this.name]) {
            this.metrics[this.name] = {};
        }
        const metrics = this.name ? this.metrics[this.name] : this.metrics;

        // initialize sampler
        let sampler;
        if (this.func.sample) {
            let sampleInterval = 100;
            if (this.func.sampleInterval) {
                sampleInterval = await this.func.sampleInterval();
            }
            sampler = new Sampler(
                () => { return this.func.sample() }, 
                sampleInterval
            );
        }

        // execute function
        let result;
        let error;
        try {
            Metrics.start(metrics);
            result = await this.func.execute(...args);
        } catch (e) {
            // errors are always at the top level
            this.metrics.error = e;
            error = e;
        } finally {
            Metrics.end(metrics);
        }

        // add sampler metrics
        if (sampler) {
            Object.assign(metrics, await sampler.finish());
        }
            
        // add metrics from result
        if (this.func.metrics) {
            Object.assign(metrics, await this.func.metrics(error, result, metrics, this.func));
        }

        // handle result
        if (error) {
            throw error;
        } else {
            return result;
        }
    }
}

function instrument(func, metrics, key) {
    return new Instrument(func, metrics, key);
}

module.exports = {
    instrument
}
