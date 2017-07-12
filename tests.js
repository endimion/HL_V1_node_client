'use strict';
var path = require('path');
var fs = require('fs');
var util = require('util');
var config = require('./config.json');
var helper = require('./utils/helper.js');
var logger = helper.getLogger('install-chaincode');
var tx_id = null;


let join = require('./utils/join-channel.js') ;
let createChannel = require('./utils/create-channel.js') ;
let instantiate = require('./utils/instantiate-chaincode.js');
let query = require('./utils/query.js');
let invoke = require('./utils/invoke-transaction.js');



//function installChaincode(org) {
var installChaincode = function(peers, chaincodeName, chaincodePath,
	chaincodeVersion, username, org) {
	console.log(
		'\n============ Install chaincode on organizations ============\n');
	helper.setupChaincodeDeploy();
	var channel = helper.getChannelForOrg(org);
	var client = helper.getClientForOrg(org);

	return helper.getOrgAdmin(org).then((user) => {
		var request = {
			targets: helper.newPeers(peers),
			chaincodePath: chaincodePath,
			chaincodeId: chaincodeName,
			chaincodeVersion: chaincodeVersion
		};
    console.log("test.js --> installChaincode");
    console.log(request);
		return client.installChaincode(request);
	}, (err) => {
		console.log('Failed to enroll user \'' + username + '\'. ' + err);
		throw new Error('Failed to enroll user \'' + username + '\'. ' + err);
	}).then((results) => {
		var proposalResponses = results[0];
		var proposal = results[1];
		var all_good = true;
		for (var i in proposalResponses) {
			let one_good = false;
			if (proposalResponses && proposalResponses[0].response &&
				proposalResponses[0].response.status === 200) {
				one_good = true;
				console.log('install proposal was good');
			} else {
				console.log('install proposal was bad');
			}
			all_good = all_good & one_good;
		}
		if (all_good) {
			console.log(util.format(
				'Successfully sent install Proposal and received ProposalResponse: Status - %s',
				proposalResponses[0].response.status));
			console.log('\nSuccessfully Installed chaincode on organization ' + org +
				'\n');
			return 'Successfully Installed chaincode on organization ' + org;
		} else {
			console.log(
				'Failed to send install Proposal or receive valid response. Response null or status is not 200. exiting...'
			);
			return 'Failed to send install Proposal or receive valid response. Response null or status is not 200. exiting...';
		}
	}, (err) => {
		console.log('Failed to send install proposal due to error: ' + err.stack ?
			err.stack : err);
		throw new Error('Failed to send install proposal due to error: ' + err.stack ?
			err.stack : err);
	});
};







var instantiateChaincode = function(channelName, chaincodeName, chaincodeVersion, functionName, args, username, org) {
	console.log('\n============ Instantiate chaincode on organization ' + org +
		' ============\n');

	var channel = helper.getChannelForOrg(org);
	var client = helper.getClientForOrg(org);

	return helper.getOrgAdmin(org).then((user) => {
		// read the config block from the orderer for the channel
		// and initialize the verify MSPs based on the participating
		// organizations
		return channel.initialize();
	}, (err) => {
		console.log('Failed to enroll user \'' + username + '\'. ' + err);
		throw new Error('Failed to enroll user \'' + username + '\'. ' + err);
	}).then((success) => {
		tx_id = client.newTransactionID();
		// send proposal to endorser
		var request = {
			chaincodeId: chaincodeName,
			chaincodeVersion: chaincodeVersion,
			fcn: functionName,
			args: args,
			txId: tx_id
		};
		console.log("test.js ==> instantiateChaincode:")
		console.log(request);
		return channel.sendInstantiateProposal(request);
	}, (err) => {
		console.log('Failed to initialize the channel');
		throw new Error('Failed to initialize the channel');
	}).then((results) => {
		var proposalResponses = results[0];
		var proposal = results[1];
		var all_good = true;
		for (var i in proposalResponses) {
			let one_good = false;
			if (proposalResponses && proposalResponses[0].response &&
				proposalResponses[0].response.status === 200) {
				one_good = true;
				console.log('instantiate proposal was good');
			} else {
				console.log('instantiate proposal was bad');
			}
			all_good = all_good & one_good;
		}
		if (all_good) {
			console.log(util.format(
				'Successfully sent Proposal and received ProposalResponse: Status - %s, message - "%s", metadata - "%s", endorsement signature: %s',
				proposalResponses[0].response.status, proposalResponses[0].response.message,
				proposalResponses[0].response.payload, proposalResponses[0].endorsement
				.signature));
			var request = {
				proposalResponses: proposalResponses,
				proposal: proposal
			};
			// set the transaction listener and set a timeout of 30sec
			// if the transaction did not get committed within the timeout period,
			// fail the test
			var deployId = tx_id.getTransactionID();

			var eh = client.newEventHub();
			let data = fs.readFileSync(path.join(__dirname, ORGS[org]['peer1'][
				'tls_cacerts'
			]));
			eh.setPeerAddr(ORGS[org]['peer1']['events'], {
				pem: Buffer.from(data).toString(),
				'ssl-target-name-override': ORGS[org]['peer1']['server-hostname']
			});
			eh.connect();

			let txPromise = new Promise((resolve, reject) => {
				let handle = setTimeout(() => {
					eh.disconnect();
					reject();
				}, 95000);

				eh.registerTxEvent(deployId, (tx, code) => {
					console.log(
						'The chaincode instantiate transaction has been committed on peer ' +
						eh._ep._endpoint.addr);
					clearTimeout(handle);
					eh.unregisterTxEvent(deployId);
					eh.disconnect();

					if (code !== 'VALID') {
						console.log('The chaincode instantiate transaction was invalid, code = ' + code);
						reject();
					} else {
						console.log('The chaincode instantiate transaction was valid.');
						resolve();
					}
				});
			});

			var sendPromise = channel.sendTransaction(request);
			return Promise.all([sendPromise].concat([txPromise])).then((results) => {
				console.log('Event promise all complete and testing complete');
				return results[0]; // the first returned value is from the 'sendPromise' which is from the 'sendTransaction()' call
			}).catch((err) => {
				console.log(
					util.format('Failed to send instantiate transaction and get notifications within the timeout period. %s', err)
				);
				return 'Failed to send instantiate transaction and get notifications within the timeout period.';
			});
		} else {
			console.log(
				'Failed to send instantiate Proposal or receive valid response. Response null or status is not 200. exiting...'
			);
			return 'Failed to send instantiate Proposal or receive valid response. Response null or status is not 200. exiting...';
		}
	}, (err) => {
		console.log('Failed to send instantiate proposal due to error: ' + err.stack ?
			err.stack : err);
		return 'Failed to send instantiate proposal due to error: ' + err.stack ?
			err.stack : err;
	}).then((response) => {
		if (response.status === 'SUCCESS') {
			console.log('Successfully sent transaction to the orderer.');
			return 'Chaincode Instantiateion is SUCCESS';
		} else {
			console.log('Failed to order the transaction. Error code: ' + response.status);
			return 'Failed to order the transaction. Error code: ' + response.status;
		}
	}, (err) => {
		console.log('Failed to send instantiate due to error: ' + err.stack ? err
			.stack : err);
		return 'Failed to send instantiate due to error: ' + err.stack ? err.stack :
			err;
	});
};


//
// createChannel.createChannel("mychannel", "../artifacts/channel/channel.tx", "nikos", "org1").then( resp=>{
// 		console.log("=============CHANEL CREATED===================");
// 		// join.joinChannel("mychannel", ["localhost:7051"],  "nikos", "org1");
// });

// join.joinChannel("mychannel", ["localhost:7051"],  "nikos", "org1");
// join.joinChannel("mychannel", ["localhost:8051"],  "nikos2", "org2");
//

// installChaincode(["localhost:7051"],"example_cc","github.com/example_cc","1.0.0", "nikos", "org1");
// installChaincode(["localhost:8051"],"example_cc","github.com/example_cc","1.0.0", "nikos2", "org2");



// instantiate.instantiateChaincode("mychannel", "example_cc", "1.0.0", "init", ["a","100","b","200"],"nikos", "org1");
// instantiate.instantiateChaincode("mychannel", "example_cc", "1.0.19", "init", ["a","100","b","200"],"nikos2", "org2");


// query.queryChaincode("peer1", "mychannel", "example_cc", ["a"], "query", "nikos3", "org1")
// .then(function(message) {
// 	console.log(message);
// });


// query.queryChaincode("peer1", "mychannel", "example_cc", ["a"], "query", "nikos3", "org2")
// .then(function(message) {
// 	console.log(message);
// });

invoke.invokeChaincode(["localhost:7051"], "mychannel", "example_cc", "move",["a","b","10"], "nikos3", "org1")
.then(function(message) {
	console.log(message);
});
