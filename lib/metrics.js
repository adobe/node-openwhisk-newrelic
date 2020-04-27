/*
Copyright 2020 Adobe. All rights reserved.
This file is licensed to you under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License. You may obtain a copy
of the License at http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software distributed under
the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
OF ANY KIND, either express or implied. See the License for the specific language
governing permissions and limitations under the License.
*/

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
 * Behavior:
 * - Errors are converted to Objects containing the error code, message, and name
 * - Maps are converted to Objects (provided that keys are strings)
 * - Array and Sets of numbers are converted to an Object containing an the average of the values
 * - Array and Sets of strings are converted to an Object containing the first item in the Array/Set
 * - All other objects are returned as is
 * @param {Object} in Input object
 */
function toMetricsObject(obj) {
    if (obj instanceof Error) {
        // code, message, name as defined by Error (not iterable),
        // and any iterable keys (like the ones in SystemError).
        // not included: stack
        return {
            ...obj,
            code: obj.code,
                message: obj.message,
                name: obj.name
        };
    } else if (obj instanceof Map) {
        const result = {};
        for (const [key,value] of obj) {
            if (typeof key === 'string') {
                result[key] = value;
            }
        }
        return result;
    } else if (Array.isArray(obj)) {
        if (obj.every(Number.isInteger) ) {
            const mean = obj.reduce((prev, curr) => prev + curr) / obj.length;
            return { mean: mean };
        }
        return { item: obj[0] };
    } else if (obj instanceof Set) {
        const objToArray = Array.from(obj);
        if (objToArray.every(Number.isInteger) ) {
            const mean = objToArray.reduce((prev, curr) => prev + curr) / objToArray.length;
            return { mean: mean };
        }
        return { item: objToArray[0] };
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
 * - Array and Sets of numbers are converted into an the average of the values
 * - Array and Sets of strings contain just the first item
 *   NOTE: If you want more advanced statistics from your arrays/sets,
 *   generate them elsewhere and pass through as a list of flat values:
 *   (somethingMean, somethingMin, etc.)
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
