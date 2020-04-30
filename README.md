<!--- when a new release happens, the VERSION and URL in the badge have to be manually updated because it's a private registry --->
[![Version](https://img.shields.io/npm/v/@adobe/node-openwhisk-newrelic.svg)](https://npmjs.org/package/@adobe/node-openwhisk-newrelic)

# node-openwhisk-newrelic

Library for gathering metrics from Apache OpenWhisk actions and sending them to New Relic Insights.

## NewRelic Insert API JSON format guidelines

Reference: <https://docs.newrelic.com/docs/insights/insights-data-sources/custom-data/send-custom-events-event-api>

* `eventType` required
* `timestamp` Unix epoch timestamp either in seconds or milliseconds
* Key-value pairs with `float` and `string` values only
* Limits:
  * 255 attributes
  * 255 characters in the attribute name
  * 4KB max length attribute value
  * 100,000 HTTP POST requests/min, 429 status after, counter reset of 1 minute window


## Usage

Initialize the New Relic Metrics agent. This will start a `setTimeout` that will send metrics if your action is close to timeout using `__OW_DEADLINE`

```javascript
const NewRelic = require('@adobe/node-openwhisk-newrelic');
const metrics = new NewRelic({
    newRelicEventsURL: 'https://insights-collector.newrelic.com/v1/accounts/<YOUR_ACOUNT_ID>/events',
    newRelicApiKey: 'YOUR_API_KEY',
});
```

Collect all your custom/background metrics in a separate object

```javascript
const customMetrics = {
    data: "value",
    userName: "sampleUser"
}
```

Send your metrics to New Relic

```javascript
await metrics.send('EVENT_TYPE', customMetrics);
```

Note that metrics are not sent immediately but are collected in the background and sent in intervals every 10 seconds by default. This can be configured via `sendIntervalMs` in the options of the constructor (in milliseconds).

You MUST call `activationFinished()` to stop the agent when you are done sending metrics, or when your action is finishing. This will clear the action timeout that began when the class instance was defined.

```javascript
metrics.activationFinished();
```

### Instrumentation

Supported instrumentation:

* **http** requests (outgoing requests, via the node `http` and `https` modules):
  - [reference documentation](#http)
  - on by default
  - can be disabled with environment variable: `OPENWHISK_NEWRELIC_DISABLE_HTTP_INSTRUMENTATION=true`
  - can also be disabled by setting `disableHttpClient: true` in the options passed to `NewRelic.instrument()`

To enable instrumentation, wrap the action main function in `NewRelic.instrument()`. A complete example might look like this:

```javascript
async function main(params) {
    const metrics = new NewRelic({
        newRelicEventsURL: 'https://insights-collector.newrelic.com/v1/accounts/<YOUR_ACOUNT_ID>/events',
        newRelicApiKey: 'YOUR_API_KEY',
    });
    try {
        // do something
    } finally {
        await metrics.activationFinished();
    }
}

exports.main = NewRelic.instrument(main);
```

To disable all instrumentation (for example in unit tests), set this environment variable:

```
OPENWHISK_NEWRELIC_DISABLE_ALL_INSTRUMENTATION=true
```

### Action Timeout

The default behavior of the agent is it will begin a `setTimeout` that will send metrics right before the  action times out, using the `OW_DEADLINE` environment variable.

In case you want to opt out of the action timeout, (example: unit tests) there are two ways to opt out:

1. Pass in `disableActionTimeout` to options:

   ```javascript
   const metrics = new NewRelic({
       newRelicEventsURL: 'https://insights-collector.newrelic.com/v1/accounts/<YOUR_ACOUNT_ID>/events',
       newRelicApiKey: 'YOUR_API_KEY',
       disableActionTimeout: true
   });
   ```

2. Set the environment variable: `DISABLE_ACTION_TIMEOUT_METRIC` to `true`:

   ```
   export DISABLE_ACTION_TIMEOUT_METRIC = true
   ```

If either of these are set to true, there will be no action timeout and calling `activationFinished` is no longer necessary.


In case you want to pass custom metrics to the action timeout, you can define a callback function in New Relic options. The result of the callback will be added to the default metrics and sent at action timeout. If you do not define an `eventType`, it will default to `timeout`.:

```javascript
const metrics = new NewRelic({
    newRelicEventsURL: 'https://insights-collector.newrelic.com/v1/accounts/<YOUR_ACOUNT_ID>/events',
    newRelicApiKey: 'YOUR_API_KEY',
    actionTimeoutMetricsCb: function () {
        return {
            eventType: 'error',
            ...customMetrics
        }
    }
});
```

### Http

Tracks each outgoing http request. Automatically instrumented in node and done in all actions.

Naming is aligned with NewRelic's standard [SyntheticRequest](https://docs.newrelic.com/attribute-dictionary?attribute_name=&events_tids%5B%5D=8387) attributes.

Event type: `http`

| Attribute         | Format           | Description                     | Example      |
|-------------------|------------------|---------------------------------|--------------|
| [...](#standard) | | [All standard attributes](#standard) | |
| `method` | string | HTTP method | `"POST"` |
| `url` | string | complete URL of the request | `"https://eg-ingress.adobe.io/api/events"` |
| `protocol` | string | protocol of the URL, `http:` or `https:` | `"https:"` |
| `domain` | string | host without any subdomain for simpler aggregation: `<domain>.<tld>` | `"adobe.io"` |
| `host` | string | hostname of the server | `"eg-ingress.adobe.io"` |
| `port` | number | TCP port of the server | `443` |
| `path` | string | path of the URL, including query parameters | `"/api/events"` |
| `responseCode` | number | HTTP response status code | `200` |
| `responseStatus` | string | HTTP response status text | `"OK"` |
| `requestBodySize` | number | size of the HTTP request body | `1874` |
| `responseBodySize` | number | size of the HTTP response body | `2` |
| `contentType` | string | content-type of the response | `"application/json;charset=UTF-8"` |
| `serverRequestId` | string | `x-request-id` header of the response, if present | `"cLqJ2lcWXUmXpnRCDULturVM9lTovQxx"` |
| `localIPAddress` | string | IP address of the client | `"172.20.0.23"` |
| `serverIPAddress` | string | IP address of the server | `"34.196.31.105"` |
| `duration` | number | total duration of the request in milliseconds | `294.551398` |
| `durationBlocked` | number | time until a socket was available in milliseconds | `0.587596` |
| `durationDNS` | number | duration of DNS resolution in milliseconds | `0.441319` |
| `durationConnect` | number | TCP connection duration in milliseconds | `1.138568` |
| `durationSSL` | number | SSL handshake duration in milliseconds (https only) | `3.639361` |
| `durationSend` | number | time it took to send the HTTP request. Note this currently does not work for streaming requests as done for our rendition uploads until we upgrade to Node 12+ in Adobe I/O Runtime. Until then the send time is included in the `durationConnect`. | `0.065885` |
| `durationWait` | number | time between request was sent and first byte of response was received in milliseconds | `288.649511` |
| `durationReceive` | number | time it took to receive the entire response body in milliseconds | `0.029158` |
| `error` | string | Only set if there was a low-level connection error. Set as `true` in json, represented as `1` in NewRelic. | `1` |
| `errorCode` | string | OS or nodejs error code (name or number) in case there was a low-level connection error. `110` means `ETIMEDOUT`. | `"ECONNRESET"` or `"110"` |
| `errorMessage` | string | Error message in case there was a low-level connection error. | `"socket hang up"` |

### Standard

Sent for all metrics.

| Attribute         | Format           | Description                     |
|-------------------|------------------|---------------------------------|
| `eventType`       | string           | Event type, required, [standard New Relic Insights type](https://docs.newrelic.com/docs/insights/insights-data-sources/custom-data/insights-custom-data-requirements-limits). |
| `timestamp`       | utc millis (?)   | The UTC timestamp to associate with the event. [Standard New Relic Insights type](https://docs.newrelic.com/docs/insights/insights-data-sources/custom-data/insights-custom-data-requirements-limits). |
| `requestId`       | string           | x-request-id of the original incoming http request |
| `namespace`       | string           | OpenWhisk namespace of the action that sent the event. |
| `package`         | string           | OpenWhisk package name of the action that sent the event.  |
| `actionName`      | string           | OpenWhisk action name (without package) of the action that sent the event. |
| `activationId`    | string           | OpenWhisk activation id of the action that sent the event. |
| `orgId`           | string           | IMS organization id of the invoking technical account/integration/client. |
| `appName`         | string           | Name of the invoking IO console integration (API key label) |
| `clientId`        | string           | API key = IMS client id of the invoking technical account/integration/client. |
| `sourceName`      | string           | Filename of the source. |
| `sourceSize`      | number           | Size in bytes of the source. |
| `cloud`           | string           | Cloud in which the activation ran, e.g. `aws` or `azure` (`__OW_CLOUD`). |
| `region`          | string           | Region in which the activation ran, e.g. `us-east-1` (`__OW_REGION`). |
| `transactionId`   | string           | OpenWhisk transaction id (`__OW_TRANSACTION_ID`). |
| `activationHost`  | string           | Hostname where the activation ran (`HOSTNAME` env var). |
| `activationContainerName`  | string  | Container name where the activation ran (`MESOS_CONTAINER_NAME` env var). |
| `nodeVersion`     | string           | Nodejs version on which the action ran, e.g. `13.12.0`. |

### Contributing
Contributions are welcomed! Read the [Contributing Guide](./.github/CONTRIBUTING.md) for more information.

### Licensing
This project is licensed under the Apache V2 License. See [LICENSE](LICENSE) for more information.
