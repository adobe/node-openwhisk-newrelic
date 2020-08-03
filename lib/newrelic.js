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

"use strict";

const Metrics = require('./metrics');
const sendQueue = require("./queue");

const httpClientProbe = require('./probe/http-client');
const cls = require("cls-hooked");

const CLS_NAMESPACE = "openwhisk-newrelic";
const CLS_KEY_NEWRELIC = "NewRelic";
const activationVars = cls.createNamespace(CLS_NAMESPACE);

// time before an action timeout when to send timeout metrics
const TIMEOUT_BUFFER = 5000;

function isBlankString(str){
    if(str === null || str === undefined || typeof str !== 'string'){
        return true;
    }
    return (/^\s*$/).test(str);
}

/**
 * @typedef NewRelicOptions
 * @type {Object}
 * @property {String} newRelicEventsURL URL pointing to the NewRelic Insert API
 * @property {String} newRelicApiKey API key to use with the NewRelic Insert API
 * @property {Number} sendIntervalMs [OPTIONAL] Interval at which to send metric events
 * to NewRelic. Defaults to 10 seconds.
 * @property {Function} actionTimeoutMetricsCb [OPTIONAL] Callback function that
 * is used when action is about to reach timeout
 * @property {Boolean} disableActionTimeout [OPTIONAL] Disable action timeout metrics
 */

/**
 * Automatic and custom action metrics for NewRelic Insights.
 */
class NewRelic {

    /**
     * Construct a NewRelic object. Create a separate one for each activation.
     *
     * @param {NewRelicOptions} options NewRelic options
     * @param {object} defaultMetrics default metrics to include in every New Relic event
     */
    constructor(options, defaultMetrics={}) {

        this.defaultMetrics = Object.assign(Metrics.openwhisk(), defaultMetrics);
        this.canSendMetrics = false;

        if (process.env.OPENWHISK_NEWRELIC_DISABLE_METRICS === `true`) {
            console.error('Sending of New Relic Metrics have been disabled.');

        } else if (!options ||
            isBlankString(options.newRelicEventsURL) ||
            isBlankString(options.newRelicApiKey)
        ) {
            console.error('Missing NewRelic events Api Key or URL. Metrics disabled.');
        } else {
            sendQueue.start(options.newRelicEventsURL, options.newRelicApiKey, options.sendIntervalMs);

            // track this object per activation for global http metrics
            if (activationVars && activationVars.active) {
                activationVars.set(CLS_KEY_NEWRELIC, this);
            }

            if (options.actionTimeoutMetricsCb && typeof options.actionTimeoutMetricsCb !== 'function') {
                console.error('Action timeout is not a proper function.');
                delete options.actionTimeoutMetricsCb;
            }
            if (!options.disableActionTimeout && !process.env.DISABLE_ACTION_TIMEOUT_METRIC ) {
                this.actionTimeoutHandlerId = sendMetricsOnActionTimeout(this, options.actionTimeoutMetricsCb);
            }
            this.canSendMetrics = true;
        }
    }

    /**
     * Add custom metrics that will be sent with every following send() of metrics, including
     * the timeout metrics (if enabled). These can be overwritten with metrics passed into
     * the send() method.
     *
     * @param {object} metrics custom metrics to add
     */
    add(metrics) {
        this.defaultMetrics = { ...this.defaultMetrics, ...metrics};
    }

    /**
     * Returns the default metrics and collected metrics from add() invocations.
     *
     * @returns {object} metrics, key value pairs as object members
     */
    get() {
        return this.defaultMetrics;
    }

    /**
     * Call this when the action activation finishes successfully.
     */
    async activationFinished() {
        // action finished succesfully, there will be no timeout
        clearTimeout(this.actionTimeoutHandlerId);
    }

    /**
     * Send an event to NewRelic
     *
     * Behavior:
     * - Add Apache OpenWhisk action metrics (See  `openwhisk` in metrics.js)
     * - Flatten out metrics object (See  `flatten` in metrics.js)
     * - Send metrics to New Relic
     *
     * @param {String} eventType Event type associated with metrics
     * @param {Object} metrics Metrics to send to NewRelic
     * @param {Boolean} immediately Set to true to immediately send this event.
     * By default, events are sent asynchronously in batches, configurable via
     * "sendIntervalMs" in the constructor options.
     */
    async send(eventType, metrics={}, immediately) {
        metrics = {
            eventType,
            timestamp: Metrics.timestamp(),
            ...this.defaultMetrics,
            ...metrics
        };

        if (!this.canSendMetrics) {
            console.error("Metrics not sent because disabled: ", metrics);
            return Promise.resolve();
        }

        await sendQueue.send(metrics, immediately);
    }
}

/**
 * @typedef {Function} ActionTimeoutMetricsCb callback function when the action is about to timeout
 * @returns {Object} metrics object to send along with timeout event
 */
/**
 * Schedules a timeout event to send to NewRelic when the action times out
 *
 * @param {ActionTimeoutMetricsCb} actionTimeoutMetricsCb Should return a metrics object
 */
function sendMetricsOnActionTimeout(self, actionTimeoutMetricsCb) {
    const timeout = Metrics.timeUntilTimeout();
    return setTimeout(
        async () => {
            let metrics = {
                duration: timeout
            };
            if (actionTimeoutMetricsCb) {
                metrics = actionTimeoutMetricsCb();
            }

            console.log(`Action will timeout in ${Metrics.timeUntilTimeout()} milliseconds. Sending metrics before action timeout.`);

            await self.send("timeout", metrics, true);

            console.log(`Metrics sent before action timeout.`);
        },
        Metrics.timeUntilTimeout() - TIMEOUT_BUFFER
    );
}

function instrumentHttpClient() {
    // Note: this only has an effect the first time its called.
    // We use of continuation-local storage in the metrics callback to get the  NewRelic
    // object instance of the current activation for actually sending the metrics and enriching
    // it with any default metrics
    httpClientProbe.start((metrics) => {
        if (activationVars && activationVars.active) {
            const newRelic = activationVars.get(CLS_KEY_NEWRELIC);
            if (newRelic) {
                newRelic.send("http", metrics);
            } else {
                console.error("Cannot find NewRelic instance for sending metrics. Possible CLS issue.");
            }
        }
    });
}

/**
 * Start automatic APM-style instrumentation by wrapping the action main function.
 * Wrapping is required for concurrent actions.
 *
 * @param {Function} main the action main function to wrap
 * @param {Object} options allows to disable certain instrumentations:
 * - disableHttpClient: disable node http & https client request instrumentation
 * @returns {Function} function to use as action main
 */
NewRelic.instrument = function(main, options={}) {
    if (!process.env.OPENWHISK_NEWRELIC_DISABLE_ALL_INSTRUMENTATION) {
        // start all instrumentation, look at options for exclusions
        if (!options.disableHttpClient && !process.env.OPENWHISK_NEWRELIC_DISABLE_HTTP_INSTRUMENTATION) {
            instrumentHttpClient();
        }
    }

    // must wrap action function for CLS to track a per-activation storage
    return async (...args) => {
        return activationVars.runAndReturn(async () => {
            return main.call(this, ...args);
        });
    };
};

/**
 * Stop instrumentation started by NewRelic.instrument().
 */
NewRelic.stopInstrument = function() {
    httpClientProbe.stop();
};

// TODO: template for an all-in-one openwhisk-newrelic metrics solution
//       by simply wrapping the main action
// NewRelic.wrapAction = async function(main, options) {
//     return NewRelic.instrument(async (params={}) => {
//         const metrics = new NewRelic(params);
//         try {
//             return await main(params);
//         } catch (e) {
//             await metrics.handleError(e);
//             throw e;
//         } finally {
//             await metrics.activationFinished();
//         }
//     }, options);
// }

module.exports = NewRelic;
