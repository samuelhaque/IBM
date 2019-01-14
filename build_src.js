/* eslint-disable no-console */

const fs = require('fs');
const rollup = require('rollup');
const commonjs = require('rollup-plugin-commonjs');
const includePaths = require('rollup-plugin-includepaths');
const nodeResolve = require('rollup-plugin-node-resolve');
const json = require('rollup-plugin-json');
const colors = require('colors/safe');

module.exports = function buildSrc() {
    var building = false;
    return function () {
        if (building) return;

        // Start clean
        unlink('dist/iD.js');
        unlink('dist/iD.js.map');

        console.log('building src');
        console.time(colors.green('src built'));

        building = true;

        return rollup
            .rollup({
                input: './modules/id.js',
                plugins: [
                    includePaths( {
                        paths: ['node_modules/d3/node_modules'],  // npm2 or windows
                        include: {
                            'martinez-polygon-clipping': 'node_modules/martinez-polygon-clipping/dist/martinez.umd.js'
                        }
                    }),
                    nodeResolve({
                        module: true,
                        main: true,
                        browser: false
                    }),
                    commonjs(),
                    json({ indent: '' })
                ]
            })
            .then(function (bundle) {
                return bundle.write({
                    format: 'iife',
                    file: 'dist/iD.js',
                    sourcemap: true,
                    strict: false
                });
            })
            .then(function () {
                building = false;
                console.timeEnd(colors.green('src built'));
            })
            .catch(function (err) {
                building = false;
                console.error(err);
                process.exit(1);
            });
    };
};


function unlink(f) {
    try {
        fs.unlinkSync(f);
    } catch (e) { /* noop */ }
}
