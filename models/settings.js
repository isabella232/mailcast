'use strict';

const config = require('wild-config');
const db = require('../lib/db');

const defaults = {
    global_site_appName: config.appname,
    global_site_baseUrl: config.www.baseUrl,
    global_user_disableJoin: false
};

module.exports.get = async key => {
    let query = {};
    let exact = false;
    let regex;

    key = (key && key.trim()) || '';

    if (key && key !== '*') {
        if (key.indexOf('*') < 0) {
            // "some.key.name"
            query.key = key;
            exact = true;
        } else if (key.indexOf('*') === key.length - 1) {
            // "some.key.*"
            regex = '^' + key.replace(/[-/\\^$+?.()|[\]{}]/g, '\\$&').replace(/\*/g, '');
            query.key = {
                $regex: regex,
                $options: 'i'
            };
        } else {
            // "some.*.name"
            regex = '^' + key.replace(/[-/\\^$+?.()|[\]{}]/g, '\\$&').replace(/\*/g, '.*') + '$';
            query.key = {
                $regex: regex,
                $options: 'i'
            };
        }
    }

    if (exact) {
        let r = await db.client.collection('settings').findOne(query);
        if (!r && typeof defaults[key] !== 'undefined') {
            return defaults[key];
        }
        return r && r.value;
    } else {
        let results = await db.client
            .collection('settings')
            .find(query, {
                projection: {
                    key: true,
                    value: true
                }
            })
            .toArray();
        let response = {};
        let keys = [];
        results.forEach(r => {
            keys.push(r.key);
            response[r.key] = r.value;
        });

        if (regex) {
            let re = new RegExp(regex, 'i');
            Object.keys(defaults).forEach(key => {
                if (re.test(key) && !response.hasOwnProperty(key)) {
                    response[key] = defaults[key];
                }
            });
        }

        return response;
    }
};

module.exports.set = async (key, value) => {
    let r = await db.client.collection('settings').findOneAndReplace(
        {
            key
        },
        {
            $set: { value },
            $setOnInsert: { key }
        },
        {
            upsert: true,
            returnOriginal: false
        }
    );

    return r && r.value;
};

module.exports.setMulti = async settings => {
    let ops = [];

    Object.keys(settings).forEach(async key => {
        ops.push({
            updateOne: {
                filter: {
                    key
                },
                update: {
                    $set: { value: settings[key] },
                    $setOnInsert: { key }
                },
                upsert: true
            }
        });
    });

    if (!ops.length) {
        return 0;
    }

    let r = await db.client.collection('settings').bulkWrite(ops, { ordered: false });
    return r.upsertedCount;
};