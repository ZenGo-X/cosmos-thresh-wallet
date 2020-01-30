const { CosmosThreshSigClient, getBalance, mnemonicTransfer, getTxInfo, getTransactions } = require('../dist/src');
const assert = require('assert');

const client = new CosmosThreshSigClient();

const network = 'gaia';

const bank = {
  address: 'cosmos1dkrllahth85vlqzyxx069f5n49qe82cxksg4u0',
};

const account1 = {
  address: 'cosmos1kq93474lnp3cdfjngeq0x5a35frwg4tskjukav',
};

const account2 = {
  address: 'cosmos1qd59rlrm0ymz3r8lpj4yecazd38grxxjtw9zk6',
};

const UMUON_IN_MUON = 1000000;

describe('Cosmos API tests', () => {
  it('Transfers money to account', async () => {
      const balanceBefore = await getBalance(account1.address, network);

      // Init the client
      await client.init();
      const res = await client.transfer(bank.address, account1.address, "10000", "umuon");
      assert.ok(res.logs[0].success)

      const balanceAfter= await getBalance(account1.address, network);
      const oldBalance = balanceBefore.result[0].amount || 0;
      const newBalance = parseInt(oldBalance) + 10000
      assert.deepEqual(balanceAfter.result[0], { denom: 'umuon', amount: `${newBalance}` });
  }).timeout(100000);

  it('Transfers funds to an account then sends all funds back', async () => {
      const balanceBefore = await getBalance(account2.address, network);
      assert.equal(balanceBefore.result.length, 0);
      // Init the client
      await client.init();
      const res = await client.transfer(bank.address, account2.address, "10000", "umuon");

      assert.ok(res.logs[0].success)
      const balanceAfter= await getBalance(account2.address, network);

      assert.deepEqual(balanceAfter.result[0], { denom: 'umuon', amount: '10000' });

      await client.transfer(account2.address, bank.address, "10000", "umuon", null, true);

      const balanceFinally = await getBalance(account2.address, network);
      assert.equal(balanceFinally.result.length, 0);


  }).timeout(100000);
});
