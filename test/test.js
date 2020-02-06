const {
  CosmosThreshSigClient,
  getBalance,
  mnemonicTransfer,
  getTxInfo,
  getTransactions,
  getStakingInfo,
  getRewardsInfo
} = require("../dist/src");
const assert = require("assert");

const client = new CosmosThreshSigClient();

const network = "gaia";

const bank = {
  address: "cosmos1dkrllahth85vlqzyxx069f5n49qe82cxksg4u0"
};

const account1 = {
  address: "cosmos1kq93474lnp3cdfjngeq0x5a35frwg4tskjukav"
};

const account2 = {
  address: "cosmos1qd59rlrm0ymz3r8lpj4yecazd38grxxjtw9zk6"
};

const delegatingAddress = "cosmos1uxw2cretxn43yc9qdkfgp30hvxvq9jum5jl65q";

const testAccount = "cosmos1mggsh05crnvns9jdzsqwzx27zch0huymsx3m5k";

const validator = "cosmosvaloper169cxw3pkffw66vxlppy86n205rklhna8l8mtam";

describe("Cosmos API tests", () => {
  it("Transfers money to account", async () => {
    const balanceBefore = await getBalance(account1.address, network);

    // Init the client
    await client.init();
    const res = await client.transfer(
      bank.address,
      account1.address,
      "10000",
      "umuon"
    );
    assert.ok(res.logs[0].success);

    const newBalance = await getBalance(account1.address, network);
    const oldBalance = balanceBefore.result[0].amount || 0;
    const exptectedBalance = parseInt(oldBalance) + 10000;
    assert.strictEqual(
      exptectedBalance.toString(),
      newBalance.result[0].amount
    );
  }).timeout(100000);

  it("Transfers funds to an account then sends all funds back", async () => {
    const balanceBefore = await getBalance(account2.address, network);
    assert.equal(balanceBefore.result.length, 0);
    // Init the client
    await client.init();
    const res = await client.transfer(
      bank.address,
      account2.address,
      "10000",
      "umuon"
    );

    assert.ok(res.logs[0].success);
    const balanceAfter = await getBalance(account2.address, network);

    assert.strictEqual(balanceAfter.result[0].amount, "10000");

    await client.transfer(
      account2.address,
      bank.address,
      "10000",
      "umuon",
      null,
      true
    );

    const balanceFinally = await getBalance(account2.address, network);
    assert.equal(balanceFinally.result.length, 0);
  }).timeout(100000);

  it("Delegates funds to a validator", async () => {
    const balanceBefore = await getStakingInfo(delegatingAddress, network);

    // Init the client
    await client.init();
    const res = await client.delegate(
      delegatingAddress,
      validator,
      "10000",
      "umuon"
    );
    assert.ok(res.logs[0].success);

    const newBalance = await getStakingInfo(delegatingAddress, network);
    const oldBalance = balanceBefore.result[0].balance || 0;
    const exptectedBalance = parseInt(oldBalance) + 10000;
    console.log(oldBalance);
    console.log(exptectedBalance);
    console.log(newBalance);
    assert.strictEqual(
      exptectedBalance.toString(),
      newBalance.result[0].balance
    );
  }).timeout(100000);

  it("Delegates funds to a validator", async () => {
    const balanceBefore = await getStakingInfo(delegatingAddress, network);

    // Init the client
    await client.init();
    const res = await client.delegate(
      delegatingAddress,
      validator,
      "10000",
      "umuon"
    );
    assert.ok(res.logs[0].success);

    const newBalance = await getStakingInfo(delegatingAddress, network);
    const oldBalance = balanceBefore.result[0].balance || 0;
    const exptectedBalance = parseInt(oldBalance) + 10000;
    console.log(oldBalance);
    console.log(exptectedBalance);
    console.log(newBalance);
    assert.strictEqual(
      exptectedBalance.toString(),
      newBalance.result[0].balance
    );
  }).timeout(100000);

  it.only("Collects rewards from validator", async () => {
    // Init the client
    await client.init();
    const res = await client.collectRewards(delegatingAddress);
    assert.ok(res.logs[0].success);

    const rewardsAfter = await getRewardsInfo(delegatingAddress, network);
    console.log(rewardsAfter);
    // No rewards after collection
    assert.equal(rewardsAfter.result.total, null);
  }).timeout(100000);
});
