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
const dl = require('datalib');
const process = require('process');

/**
 * Retrieve timestamp in milliseconds since Unix epoch for 
 * use in NewRelic metrics.
 */
function timestamp() {
    return Date.now();
}

/**
 * Add a start timestamp to the given metrics object.
 * 
 * @param {Object} [metrics={}] Metrics object
 * @returns {Object} Metrics object
 */
function start(metrics) {
    metrics = metrics || {};
    return Object.assign(metrics, {
        start: timestamp()
    });
}

/**
 * Add an end timestamp to the given metrics object,
 * calculates duration. Requires start() to be called first.
 * 
 * @param {Object} metrics Metrics object
 * @returns {Object} Metrics object
 */
function end(metrics) {
    assert.ok(metrics);
    assert.strictEqual(typeof metrics.start, 'number');

    metrics.end = timestamp();
    metrics.duration = metrics.end - metrics.start;
    return metrics;
}

/**
 * OpenWhisk information from the environment
 * 
 * @param {Object} [metrics={}] Metrics object
 * @returns {Object} Metrics object
 */
function openwhisk(metrics) {
    metrics = metrics || {};
    if (process.env.__OW_ACTION_NAME) {
        metrics.actionName = process.env.__OW_ACTION_NAME.split("/").pop();
    }
    if (process.env.__OW_NAMESPACE) {
        metrics.namespace = process.env.__OW_NAMESPACE;
    }
    if (process.env.__OW_ACTIVATION_ID) {
        metrics.activationId = process.env.__OW_ACTIVATION_ID;
    }
    return metrics;
}

/**
 * Convert a given summary as calculated by datalib in to a plain object
 * with only the fields we are interested in.
 * 
 * @param {Object} summary Summary as calculated by datalib
 * @returns Plain object with only the fields we are interested in
 */
function summaryObject(summary) {
    return {
        min: summary.min,
        max: summary.max,
        mean: summary.mean,
        stdev: summary.stdev,
        median: summary.median,
        q1: summary.q1,
        q3: summary.q3
    }
}

/**
 * Calculate summary statistics from an array-like or iterable object of metrics
 * 
 * Input:
 * - array of numbers
 * - array of objects with number attributes
 * 
 * Returns:
 * - Calculated min, max, mean, stdev, median, q1, q3 statistics
 * - Object with the calculated summary statistics if the input was an array of numbers
 * - Object with the calculated summary statistics for each number attribute
 * 
 * @param {Array} data Array-like or iterable object of metrics
 * @returns {Object} Summary statistics 
 */
function summary(data) {
    const array = Array.from(data);
    if (array.length === 0) {
        return {};
    }

    if (typeof array[0] === "number") {
        return summaryObject(dl.profile(array));
    } else if (typeof array[0] === "object") {
        const result = {};
        const summary = dl.summary(array);
        for (const field of summary) {
            if (field.type === "number") {
                result[field.field] = summaryObject(field);
            }
        }
        return result;
    } else {
        throw Error("not supported");
    }
}

module.exports = {
    timestamp,
    start,
    end,
    openwhisk,
    summary
}
