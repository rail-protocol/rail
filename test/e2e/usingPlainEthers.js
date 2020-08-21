// TODO: these must be synced with streamr-docker-dev/oracles.env
const ORACLE_VALIDATOR_ADDRESS_PRIVATE_KEY = "5e98cce00cff5dea6b454889f359a4ec06b9fa6b88e9d69b86de8e1c81887da0"
const DATACOIN_ADDRESS = "0xbAA81A0179015bE47Ad439566374F2Bae098686F"
const erc677SidechainAddress = "0x3b11D489411BF11e843Cb28f8824dedBfcB75Df3"

const {
    Contract,
    Wallet,
    providers: { JsonRpcProvider },
    utils: { bigNumberify }
} = require("ethers")

const assert = require("assert")
const until = require("../../util/await-until")

const log = require("debug")("Streamr:du:test:e2e:plain")
//require("debug").log = console.log.bind(console)  // get logging into stdout so mocha won't hide it

const deployDU = require("../../util/deployDU")

const {
    deployDataUnionFactorySidechain,
    deployDataUnionFactoryMainnet,
    getTemplateSidechain,
} = require("../utils/deployDUFactories")

const providerSidechain = new JsonRpcProvider({
    url: "http://10.200.10.1:8546",
    timeout: process.env.TEST_TIMEOUT,
})
const providerMainnet = new JsonRpcProvider({
    url: "http://10.200.10.1:8545",
    timeout: process.env.TEST_TIMEOUT,
})
const walletSidechain = new Wallet(ORACLE_VALIDATOR_ADDRESS_PRIVATE_KEY, providerSidechain)
const walletMainnet = new Wallet(ORACLE_VALIDATOR_ADDRESS_PRIVATE_KEY, providerMainnet)

const Token = require("../../build/contracts/IERC20.json")
const erc677Sidechain = new Contract(erc677SidechainAddress, Token.abi, walletSidechain)
const erc20Mainnet = new Contract(DATACOIN_ADDRESS, Token.abi, walletMainnet)

const DataUnionSidechain = require("../../build/contracts/DataUnionSidechain.json")

describe("Data Union tests using only ethers.js directly", () => {
    // for faster manual testing, use a factory from previous runs
    //const DataUnionFactoryMainnet = require("../../build/contracts/DataUnionFactoryMainnet.json")
    //const factoryMainnet = new Contract("0xD5beE21175494389A10aFDA8FeBC8465A3A35DE0", DataUnionFactoryMainnet.abi, walletMainnet)

    let factoryMainnet
    before(async function () {
        this.timeout(process.env.TEST_TIMEOUT || 60000)
        const factorySidechain = await deployDataUnionFactorySidechain(walletSidechain)
        const templateSidechain = getTemplateSidechain()
        factoryMainnet = await deployDataUnionFactoryMainnet(walletMainnet, templateSidechain.address, factorySidechain.address)
        log(`Deployed factory contracts sidechain ${factorySidechain.address}, mainnet ${factoryMainnet.address}`)
    })

    it("can deploy, add members and withdraw", async function () {
        this.timeout(process.env.TEST_TIMEOUT || 300000)
        const member = "0x4178baBE9E5148c6D5fd431cD72884B07Ad855a0"
        const member2 = "0x0101010101010101010010101010101001010101"
        const duname = "test0"
        const sendAmount = "1000000000000000000"

        const duMainnet = await deployDU(duname, 0, factoryMainnet, providerSidechain, process.env.TEST_TIMEOUT || 240000)
        const sidechainAddress = await factoryMainnet.sidechainAddress(duMainnet.address)
        const duSidechain = new Contract(
            sidechainAddress,
            DataUnionSidechain.abi,
            walletSidechain
        )
        log(`working with DU named ${duname}, mainnet_address = ${duMainnet.address}, sidechain_address = ${sidechainAddress}`)

        const balanceBefore = await erc20Mainnet.balanceOf(member)

        await printStats(duSidechain, member)
        await addMembers(duSidechain, [member, member2])
        await printStats(duSidechain, member)
        await testSend(duMainnet, duSidechain, sendAmount)
        await printStats(duSidechain, member)
        await withdraw(duSidechain, member)
        await printStats(duSidechain, member)

        const balanceAfter = await erc20Mainnet.balanceOf(member)
        assert.equal(balanceAfter.sub(balanceBefore).toString(), bigNumberify(sendAmount).div("2").toString())
    })
})

// goes over bridge => extra wait
// duSidechain needed just for the wait!
async function testSend(duMainnet, duSidechain, tokenWei) {
    const bal = await erc20Mainnet.balanceOf(walletMainnet.address)
    log(`User wallet mainnet balance ${bal}`)

    //transfer ERC20 to mainet contract
    const tx1 = await erc20Mainnet.transfer(duMainnet.address, tokenWei)
    await tx1.wait()
    log(`Transferred ${tokenWei} to ${duMainnet.address}, sending to bridge`)

    //sends tokens to sidechain contract via bridge, calls sidechain.addRevenue()
    const duSideBalanceBefore = await duSidechain.totalEarnings()
    const tx2 = await duMainnet.sendTokensToBridge()
    await tx2.wait()

    log(`Sent to bridge, waiting for the tokens to appear at ${duSidechain.address} in sidechain`)
    await until(async () => !duSideBalanceBefore.eq(await duSidechain.totalEarnings()), 360000)
    log(`Confirmed DU sidechain balance ${duSideBalanceBefore} -> ${await duSidechain.totalEarnings()}`)
}

// goes over bridge => extra wait
async function withdraw(duSidechain, member) {
    const balanceBefore = await erc20Mainnet.balanceOf(member)
    log(`withdraw for ${member} (mainnet balance ${balanceBefore})`)
    const tx = await duSidechain.withdrawAll(member, true)
    await tx.wait()
    log(`withdraw submitted for ${member}, waiting to receive the tokens on the mainnet side...`)
    await until(async () => !balanceBefore.eq(await erc20Mainnet.balanceOf(member)), 360000)
}

// "instant" in that it doesn't go over bridge
async function addMembers(duSidechain, members) {
    const tx = await duSidechain.addMembers(members)
    await tx.wait()
    log(`Added members ${members} to DU ${duSidechain.address}`)
}

async function printStats(duSidechain, member) {
    const bal1 = await erc20Mainnet.balanceOf(member)
    log(`${member} mainnet balance ${bal1}`)
    const bal2 = await erc677Sidechain.balanceOf(member)
    log(`${member} side-chain balance ${bal2}`)

    const memberData = await duSidechain.memberData(member)
    if (memberData.status === 0) {
        log(`${member} is not in DU ${duSidechain.address}`)
    } else {
        const bal3 = await duSidechain.getWithdrawableEarnings(member)
        log(`${member} side-chain withdrawable ${bal3}`)
        const bal4 = await duSidechain.totalEarnings()
        log(`${member} side-chain total earnings ${bal4}`)
    }

    const bal5 = await erc677Sidechain.balanceOf(duSidechain.address)
    log(`side-chain DU ${duSidechain.address} token balance ${bal5}`)
}
