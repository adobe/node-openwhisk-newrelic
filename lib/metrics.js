/*
 * Copyright 2020 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */


'use strict';

const process = require('process');
const fs = require('fs');
const dotenv = require('dotenv');

const DEFAULT_METRIC_TIMEOUT_MS = 60000; // default openwhisk action timeout
const DEFAULT_MAX_STRING_LENGTH = 100;
const DEFAULT_ERROR_METRIC_MAX_STRING_LENGTH = process.env.NEW_RELIC_ERROR_METRIC_MAX_STRING_LENGTH || 1500;
const ERROR_METRIC_NAMES = [
    'message',
    'errorMessage',
    'error'
];

const LIB_RELEASE_PATH = '/etc/os-release';
const LIB_RELEASE_PATH_SECONDARY = '/usr/lib/os-release';

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

const ENV_VAR_METRICS = {
    // 1:1 env var value to metrics
    __OW_NAMESPACE:       "namespace",
    __OW_ACTIVATION_ID:   "activationId",
    __OW_REGION:          "region",
    __OW_CLOUD:           "cloud",
    __OW_TRANSACTION_ID:  "transactionId",
    HOSTNAME:             "activationHost",
    MESOS_CONTAINER_NAME: "activationContainerName",

    // custom handling
    __OW_ACTION_NAME: (value, metrics) => {
        const fullActionNameArray = value.split("/");
        metrics.actionName = fullActionNameArray.pop();
        if (fullActionNameArray.length > 2) {
            metrics.package = fullActionNameArray.pop();
        }
    }
};

function truncateString(str = "", maxLength = DEFAULT_MAX_STRING_LENGTH) {
    return (str.length > maxLength) ? `${str.substring(0, maxLength - 3)}...` : str;
}

/**
 * OpenWhisk information from the environment
 *
 * @param {Object} [metrics={}] Metrics object
 * @returns {Object} Metrics object
 */
function openwhisk(metrics) {
    metrics = metrics || {};

    try {
        Object.entries(ENV_VAR_METRICS).forEach(([envVar, attribute]) => {
            if (process.env[envVar]) {
                if (typeof attribute === "function") {
                    attribute(process.env[envVar], metrics);
                } else {
                    metrics[attribute] = process.env[envVar];
                }
            }
        });

        // 'v13.12.0' => '13.12.0'
        metrics.nodeVersion = process.version.substr(1);

    } catch (e) {
        console.error("Could not get basic metrics:", e);
    }

    try {
        // container memory size
        metrics.containerMemorySize = parseInt(fs.readFileSync('/sys/fs/cgroup/memory.max'), 10) || undefined;
    // eslint-disable-next-line no-unused-vars
    } catch (e) {
        // ignore error if not in the context of a docker container
    }

    try {
        // container os and version read from os-release - https://www.linux.org/docs/man5/os-release.html
        let osReleaseText;
        if (fs.existsSync(LIB_RELEASE_PATH)) {
            osReleaseText = fs.readFileSync(LIB_RELEASE_PATH);
        } else if (fs.existsSync(LIB_RELEASE_PATH_SECONDARY)) {
            osReleaseText = fs.readFileSync(LIB_RELEASE_PATH_SECONDARY);
        }

        if (osReleaseText){
            const osRelease = dotenv.parse(osReleaseText);
            metrics.containerOS = osRelease.NAME || undefined;
            metrics.containerOSVersion = osRelease.VERSION_ID || undefined;
        }
    // eslint-disable-next-line no-unused-vars
    } catch (e) {
        // ignore error if not in the context of a docker container
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
                // increase max string length for error metrics
                if (ERROR_METRIC_NAMES.includes(key)) {
                    result[key] = truncateString(value, DEFAULT_ERROR_METRIC_MAX_STRING_LENGTH);
                } else {
                    result[key] = truncateString(value);
                }
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
        if (type === "string") {
            // increase max string length for error metrics
            if (ERROR_METRIC_NAMES.includes(key)) {
                result[`${parentKey}${key}`] = truncateString(value, DEFAULT_ERROR_METRIC_MAX_STRING_LENGTH);
            } else {
                result[`${parentKey}${key}`] = truncateString(value);
            }
        } else if (type === "number") {
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
};
