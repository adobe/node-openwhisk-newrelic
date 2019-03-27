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
    return Object.assign(metrics, {
        actionName: process.env.__OW_ACTION_NAME.split("/").pop(),
        namespace: process.env.__OW_NAMESPACE,
        activationId: process.env.__OW_ACTIVATION_ID
    });
}

module.exports = {
    timestamp,
    start,
    end,
    openwhisk
}
