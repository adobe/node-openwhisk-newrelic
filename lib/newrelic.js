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

"use strict";

const Metrics = require('./metrics');
const request = require('request-promise-native');
const { promisify } = require('util');
const gzip = promisify(require('zlib').gzip);

/**
 * @typedef NewRelicOptions
 * @type {Object}
 * @property {String} url URL pointing to the NewRelic Insert API
 * @property {String} apiKey API key to use with the NewRelic Insert API
 */

/**
 * Transmit metrics to NewRelic 
 */
class NewRelic {

    /**
     * Construct a NewRelic object
     * 
     * @param {NewRelicOptions} options NewRelic options
     */
    constructor(options) {
        this.url = options.url;
        this.apiKey = options.apiKey;
    }

    /**
     * Send an event to NewRelic
     * 
     * @param {String} eventType Event type associated with metrics
     * @param {Object} metrics Metrics to send to NewRelic
     */
    async send(eventType, metrics) {
        try {
            metrics = Object.assign({}, metrics, {
                eventType,
                timestamp: Metrics.timestamp()
            });
            Metrics.openwhisk(metrics);
    
            const json = JSON.stringify(NewRelic.flatten(metrics));
            const body = await gzip(json);
            const response = await request.post(this.url, {
                headers: {
                    'Content-Type': 'application/json',
                    'X-Insert-Key': this.apiKey,
                    'Content-Encoding': 'gzip' 
                },
                body
            });
            console.log(`Metrics sent to NewRelic: ${response}`)
        } catch (e) {
            console.error(`Unable to send metrics to NewRelic: ${e.message}`);
        }


        return new Promise(resolve => {
            // We still want to continue the action even if there is an error in sending metrics to New Relic
            try {
                const url = params.newRelicEventsURL;
                
                metrics.actionName = proc.env.__OW_ACTION_NAME.split('/').pop();
                metrics.namespace = proc.env.__OW_NAMESPACE;
                metrics.activationId = proc.env.__OW_ACTIVATION_ID;
                
                return zlib.gzip(JSON.stringify(metrics), function (_, result) {
                    request.post({
                        headers: {
                            'content-type': 'application/json',
                            'X-Insert-Key': params.newRelicApiKey,
                            'Content-Encoding': 'gzip' },
                        url:     url,
                        body:    result
                    }, function(err, res, body){
                        if (err) { 
                            console.log('Error sending event to New Relic:', err); 
                        } else if (res.statusCode !== 200) {
                            console.log('statusCode:', res && res.statusCode);
                        } else {
                            console.log('Event sent to New Relic', body); 
                        }
                        // promise always resolves so failure of sending metrics does not cause action to fail
                        resolve();
                    });
                });
                
            } catch (error) {
                console.error('Error sending metrics to New Relic. CHeck New Relic Api Key and Account Id');
                resolve();
                
            }
        })
    }

    /**
     * Flatten metrics object so it can be sent to NewRelic.
     * 
     * Behavior:
     * - Only owned key/value pairs are returned
     * - Only object, string and number values are supported
     * - Nested objects are flattened by using the "_" separator in the key, e.g. 
     *   "parent_child_child"
     * 
     * @param {Object} metrics Metrics object
     */
    static flatten(metrics, parentKey) {
        parentKey = parentKey || "";
        const result = {};
        for (const { key, value } of Object.entries(metrics)) {
            if (typeof value === "object") {
                Object.assign(result, NewRelic.flatten(value, `${parentKey}${key}_`));
            } else if ((typeof value === "number") || (typeof value === "string")) {
                result[`${parentKey}${key}`] = value;
            } else {
                throw Error(`Unsupported property: ${key}: ${value}`);
            }
        }
        return result;
    }

}

// async function trial() {
//     const agent = new Agent({

//     });

//     let metrics = {};

//     try {
//         metrics = await agent.start(metrics, 'download')
//         // download
//         metrics = await agent.success(metrics, 'download', {
//             size: 10000,
//             url: 'abc'
//         });
//     } catch (e) {
//         metrics = await agent.error(metrics, 'download', e);
//     }

//     const metrics = new metrics();
//     try {
//         await metrics.start('download');
//         // download
//         await metrics.success('download', {
//             size: 10000,
//             url: 'abc'
//         });
//     } catch (e) {
//         await metrics.error('download', e);
//     }

//     const result = await agent.measure('download', async () => {
//         return {
//             size: 10000,
//             url: 'abc'
//         }
//     })

//     agent.instrument('download', async (metrics) => {
//         metrics.xyz = 'abc';
//         //blah



//     })

// }

module.exports = {
    NewRelic
}
