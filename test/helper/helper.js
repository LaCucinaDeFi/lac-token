const {signTypedData_v4} = require('eth-sig-util');

const name = 'Vault';
const version = '1.0.0';

async function claim(Vault, user, amount, receiver, pk, chainId) {
	// should be able to claim with latest nonce
	const currentNonce = await Vault.userNonce(user);

	const signature = await createSignature(
		pk,
		user,
		amount,
		currentNonce,
		receiver,
		3,
		Vault.address,
		chainId
	);

	//claim tokens
	await Vault.claim(amount, receiver, 3, signature, {
		from: user
	});
}
async function createSignature(
	pk,
	userAddress,
	claimAmount,
	nonceValue,
	receiverAddress,
	referenceNumberValue,
	contractAddress,
	chainId
) {
	const typedMessage = {
		data: {
			types: {
				EIP712Domain: [
					{name: 'name', type: 'string'},
					{name: 'version', type: 'string'},
					{name: 'chainId', type: 'uint256'},
					{name: 'verifyingContract', type: 'address'}
				],
				Claim: [
					{name: 'account', type: 'address'},
					{name: 'amount', type: 'uint256'},
					{name: 'receiver', type: 'uint256'},
					{name: 'nonce', type: 'uint256'},
					{name: 'referenceNumber', type: 'uint256'}
				]
			},
			domain: {
				name,
				version,
				chainId,
				verifyingContract: contractAddress
			},
			primaryType: 'Claim',
			message: {
				account: userAddress,
				amount: claimAmount,
				receiver: receiverAddress,
				nonce: nonceValue,
				referenceNumber: referenceNumberValue
			}
		}
	};

	const signature = await signTypedData_v4(pk, typedMessage);
	return signature;
}

module.exports = {claim, createSignature};
