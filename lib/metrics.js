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

const process = require('process');

const DEFAULT_METRIC_TIMEOUT_MS = 60000; // default openwhisk action timeout

/**
 * Retrieve timestamp in milliseconds since Unix epoch for 
 * use in NewRelic metrics.
 */
function timestamp() {
    return Date.now();
}

/**
 * Calculates the time until the open whisk action timeout
 * @returns {Number} Time in milliseconds until the action will time out
 */
function timeUntilTimeout() {
    return (process.env.__OW_DEADLINE - Date.now()) || DEFAULT_METRIC_TIMEOUT_MS;
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
        const fullActionNameArray = process.env.__OW_ACTION_NAME.split("/");
        metrics.actionName = fullActionNameArray.pop();
        if (fullActionNameArray.length > 2) {
            metrics.package = fullActionNameArray.pop();
        }
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
 * Convert an incoming object to a metrics object.
 * 
 * @param {Object} in Input object
 */
function toMetricsObject(obj) {
    if (obj instanceof Error) {
        // code, message, name as defined by Error (not iterable),
        // and any iterable keys (like the ones in SystemError).
        // not included: stack
        return Object.assign({},
            obj,
            { 
                code: obj.code,
                message: obj.message,
                name: obj.name
            }
        );
    } else if (obj instanceof Map) {
        const result = {};
        for (const [key,value] of obj) {
            if (typeof key === 'string') {
                result[key] = value;
            }
        }
        return result;
    } else if (obj instanceof Array) {
        const mean = obj.reduce((prev, curr) => prev + curr) / obj.length;
        return { mean: mean };
    } else if (obj instanceof Set) {
        const objToArray = Array.from(obj);
        const mean = objToArray.reduce((prev, curr) => prev + curr) / objToArray.length;
        return { mean: mean };
    } else {
        return obj;
    }
}

/**
 * Flatten metrics object.
 * 
 * Behavior:
 * - Only owned key/value pairs are returned
 * - Number and string values are passed as-is
 * - Boolean values are converted in to 1 (true) or 0 (false)
 * - Bigint values are converted to strings
 * - Nested objects are flattened by using the "_" separator in the key, e.g. 
 *   "parent_child_child"
 * - Maps are converted to Objects (provided that keys are strings), then flattened
 * - Array and Sets are turned in to summary statistics
 * 
 * @param {Object} metrics Metrics object
 */
function flatten(metrics, parentKey) {
    parentKey = parentKey || "";
    const result = {};
    for (const [ key, value ] of Object.entries(metrics)) {
        const type = typeof value;
        if ((type === "number") || (type === "string")) {
            result[`${parentKey}${key}`] = value;
        } else if (type === "boolean") {
            result[`${parentKey}${key}`] = value ? 1 : 0;
        } else if (type === "bigint") {
            result[`${parentKey}${key}`] = value.toString();
        } else if (!value) {
            // ignore null or undefined values
        } else if (type === "object") {
            const metrics = toMetricsObject(value);
            Object.assign(result, flatten(
                metrics, 
                `${parentKey}${key}_`
            ));
        } else {
            // function and symbol
            throw Error(`Unsupported property: ${key}: ${value} (type: ${type})`);
        }
    }
    return result;
}



module.exports = {
    timestamp,
    openwhisk,
    flatten,
    timeUntilTimeout
}
