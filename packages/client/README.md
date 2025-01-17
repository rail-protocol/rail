<h1 align="left">
  Rail Client
</h1>

The Rail framework is a data crowdsourcing and crowdselling solution. Working in tandem with the Streamr Network and Ethereum, the framework powers applications that enable people to earn by sharing valuable data. You can [read more about it here](https://docs.rail.dev/getting-started/intro)

#### Getting started

Start by obtaining a RailClient object:
1) Give the RailClient an access to signing with your private key.
2) Choose a desired EVM chain and add it to the chain parameter. We currently support `gnosis`, and `polygon` (default).

This first option for browsers is to hand in the Metamask object. This means RailClient will not ever see the private key, and can only send transactions and sign messages with the user's explicit consent (pops up a Metamask window). This would connect to the polygon chain using Metamask:
```js
import { RailClient } from '@rail-protocol/client'
const { ethereum } = window
const rail = new RailClient({
  auth: { ethereum }
});
```

The second option is to give the private key directly in cleartext. This is meant for the server side node.js scripts, but also can be used in the browser; especially in the case where you don't need to sign things at all but only use the "getters" or read-only functions, in which case you can give a bogus/0x000... private key (since it won't ever be used). On server, it's recommended to store the private key encrypted on disk and only decrypt it just before handing it to the RailClient, so that it will be in cleartext only in memory, never on disk.
```js
import { RailClient } from '@rail-protocol/client'
const { privateKey } = Wallet.fromEncryptedJsonSync(process.env.WALLET_FILE)
const rail = new RailClient({
  auth: { privateKey },
  chain: 'gnosis',
});
```

The RailClient object can be used to either deploy a new Vault contract, or manipulate/query an existing one.

The address that deploys the contract will become the operator of the vault. To deploy a new Vault with default [deployment options](#deployment-options):
```js
const vault = await rail.deployVault()
```

To get an existing (previously deployed) `Vault` instance:
```js
const vault = await rail.getVault('0x12345...')
```


#### Admin Functions

Executing the operator functions generate transactions and as such require having enough of the native token to pay the gas on the chain you deployed on. To get some native token, you can reach out on the [Vault Discord](https://discord.gg/AY7kDBEtkr). We can send you some to get started. Transactions usually cost a fraction of a cent in Polygon, and Gnosis has historically been especially cheap.

Adding beneficiaries using operator functions is not at feature parity with the beneficiary function `join`. The newly added beneficiary will not automatically be granted publish permissions to the streams inside the Vault. This will need to be done manually using the StreamrClient, see `StreamrClient.grantPermissions()`. Similarly, after removing a beneficiary using the operator function `removeMembers`, the publish permissions will need to be removed in a secondary step using `StreamrClient.revokePermissions()`. This is because the beneficiary function `join` relies on Vault DAO hosted infrastructure, while the operator functions are completely self-sufficient (in fact, the Vault DAO hosted server uses these very operator functions :).

Adding beneficiaries (joinPart agent only, [read here more about the roles](https://docs.rail.dev/main-concepts/roles-and-responsibilities/joinpart-agents)):
```js
const receipt = await vault.addMembers([
    '0x11111...',
    '0x22222...',
    '0x33333...',
])
```
Removing beneficiaries (joinPart agent only (usually the operator is also a joinPart agent) read more [here](https://docs.rail.dev/main-concepts/roles-and-responsibilities/joinpart-agents)):
```js
const receipt = await vault.removeMembers([
    '0x11111...',
    '0x22222...',
    '0x33333...',
])
```
New Vaults have the "beneficiary weights" feature, it can be used to give some beneficiaries different share of revenues. The weights are relative to each other, so if you have e.g. 3 beneficiaries with weights `1.5, 1.5, 3`, then the first two beneficiaries will get 25% each, and the third beneficiary will get 50% of the future revenues. The weights can be set when adding beneficiaries:
```js
const receipt = await vault.addMembersWithWeights([
    ['0x11111...', 1.5],
    ['0x22222...', 1.5],
    ['0x33333...', 3],
])
```
The weights can be changed later with the `setMemberWeights` function, which additionally allows adding and removing beneficiaries in the same transaction:
```js
const receipt = await vault.setMemberWeights([
    ['0x11111...', 3], // change the weight
    ['0x22222...', 0], // remove beneficiary
    ['0x44444...', 3], // add new beneficiary
])
```
The users can part with the vault themselves
```js
const receipt = await vault.part()
```

Checking if an address belongs to the Vault:
```js
const isMember = await vault.isMember('0x12345...')
```

Send all withdrawable earnings to the beneficiary's address:
```js
const receipt = await vault.withdrawAllToMember('0x12345...')
```

Send all withdrawable earnings to the address signed off by the beneficiary:
```js
const recipientAddress = '0x22222...'

const signature = await vault.signWithdrawAllTo(recipientAddress)
const receipt = await vault.withdrawAllToSigned(
    '0x11111...', // beneficiary address
    recipientAddress,
    signature
)
```

Send only some of the withdrawable earnings to the address signed off by the beneficiary
```js
const oneEth = "1000000000000000000" // amounts in wei
const signature = await vault.signWithdrawAmountTo(recipientAddress, oneEth)
const receipt = await vault.withdrawAmountToSigned(
    '0x12345...', // beneficiary address
    recipientAddress,
    oneEth,
    signature
)
```

Setting a new operator fee:
```js
// Any number between 0 and 1, inclusive
const receipt = await vault.setAdminFee(0.4)
```

Setting new metadata: Store information about your vault in a JSON file on-chain inside the contract. For example you can store a DAO manifesto, a name or anything else you can think of.
```js
const receipt = await vault.setMetadata(
    {"name": "awesome Vault", "maintainer": ["josh#4223", "marc#2324"]}
);

const metadata = await vault.getMetadata();
```

If the Vault is set up to use the [default join server](https://github.com/rail-protocol/rail/tree/main/packages/default-join-server) then beneficiaries can join the Vault by giving a correct secret.

Admin can add secrets that allow anyone to join, as well as revoke those secrets, using the following functions:
```js
await vault.createSecret() // returns the newly created secret
await vault.createSecret('user XYZ') // operator can also give the secret a more human-readable name
await vault.deleteSecret(secret) // secret as returned by createSecret
await vault.listSecrets() // in case you forgot ;)
```

The `vault.createSecret()` response will look like the following:
```js
{
	"secret": "0fc6b4d6-6558-4c04-b42e-49a8ae5b5ebf",
	"vault": "0x12345",
	"chain": "polygon",
	"name": "A human-readable label for the new secret"
}
```

The beneficiary can then join using that same response object, or simply an object with the correct field "secret":
```js
await vault.join(secretResponse)
await vault.join({ secret: "0fc6b4d6-6558-4c04-b42e-49a8ae5b5ebf" })
```

#### Query functions
These are available for everyone and anyone, to query publicly available info from a Vault.

Get Vault's statistics:
```js
const stats = await vault.getStats()
```
Get a beneficiary's stats:
```js
const beneficiaryStats = await vault.getMemberStats('0x12345...')
```
Get the withdrawable DATA tokens in the Vault for a beneficiary:
```js
// Returns a BigNumber
const balance = await vault.getWithdrawableEarnings('0x12345...')
```
Getting the set operator fee:
```js
const operatorFee = await vault.getAdminFee()
```
Getting operator's address:
```js
const operatorAddress = await vault.getAdminAddress()
```

Getting the Vault's version:
```js
const version = await vault.getVersion()
// 400 for first version of Rail Vaults
// 0 if the contract is not a vault at all
```

#### Deployment options

`deployVault` can take an options object as the argument. It's an object that can contain the following parameters. All shown values are the defaults for each property:
```js
const deploymentOptions = {
    operatorAddress: "0x123...", // If omitted, defaults to the deployer. Will be the operator of the newly created vault
    operatorFee: 0.3, // Share of revenue allocated to the operatorAddress. Must be between 0...1
    joinPartAgents: ["0x123..."], // Addresses that can join and part beneficiaries. If omitted, set by default to include the operator as well as the default join server hosted by Rail Protocol
    metadata: { // optional
        "information": "related to your vault",
        "canBe": ["", "anything"]
    }
}

const vault = await rail.deployVault({
    deploymentOptions
})
```

The [Default Join Server](https://github.com/vaults/default-join-server) hosted by the Rail Protocol is added as a `joinPartAgent` by default so that joining with secret works using the beneficiary function `join`. If you plan to run your own join server, include its address in the `joinPartAgents`:
```js
const vault = await rail.deployVault({
    joinPartAgents: [operatorAddress, myJoinServerAddress],
    operatorFee,
})
```

### Utility functions
In order to retrieve the client's address an async call must me made to `vaults.getAddress`
```js
const address = await vaults.getAddress()
```

If you want to generate a new random wallet, you can use
```js
const { address, privateKey } = RailClient.generateEthereumAccount()
```
