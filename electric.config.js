'use strict';

var marble = require('marble');

module.exports = {
	metalComponents: ['electric-marble-components', 'marble-topbar'],
	sassOptions: {
		includePaths: ['node_modules', marble.src]
	},
	envOptions: {
		website: {
			basePath: '/'
		},
		ghpages: {
      basePath: '/ivoryshield',
      deployOptions: {
        branch: 'gh-pages',
        repo: 'https://' + process.env['GH_TOKEN'] + '@github.com/loopingz/ivoryshield.git'
      }
		}
	},
	vendorSrc: ['node_modules/marble/build/fonts/**']
};
