/**
 * ADOBE CONFIDENTIAL
 * ___________________
 *
 *  Copyright 2020 Adobe
 *  All Rights Reserved.
 *
 * NOTICE:  All information contained herein is, and remains
 * the property of Adobe and its suppliers, if any. The intellectual
 * and technical concepts contained herein are proprietary to Adobe
 * and its suppliers and are protected by all applicable intellectual
 * property laws, including trade secret and copyright laws.
 * Dissemination of this information or reproduction of this material
 * is strictly forbidden unless prior written permission is obtained
 * from Adobe.
 */

 'use strict';

function originalFunctionName(fnName) {
    return `____${fnName}_original`;
}

function isWrapped(obj, fnName) {
    return obj[originalFunctionName(fnName)] !== undefined;
}

function wrapFunction(obj, fnName, wrapFn, opts) {
    // only wrap once
    if (isWrapped(obj, fnName)) {
        return;
    }
    const original = obj[fnName];
    obj[originalFunctionName(fnName)] = original;
    obj[fnName] = wrapFn(original, obj, opts);
}

function unwrapFunction(obj, fnName) {
    if (isWrapped(obj, fnName)) {
        obj[fnName] = obj[originalFunctionName(fnName)];
        delete obj[originalFunctionName(fnName)];
    }
}

module.exports = {
    wrap: wrapFunction,
    unwrap: unwrapFunction
};
