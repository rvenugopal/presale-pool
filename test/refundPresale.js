const chai = require('chai');

const server = require('./server');
const util = require('./util');

const expect = chai.expect;

describe('refundPresale', () => {
    let creator;
    let buyer1;
    let buyer2;
    let web3;

    before(async () => {
        let result = await server.setUp();
        web3 = result.web3;
        creator = result.addresses[0].toLowerCase();
        buyer1 = result.addresses[1].toLowerCase();
        buyer2 = result.addresses[2].toLowerCase();
    });


    after(() => {
        server.tearDown();
    });

    let PresalePool;
    beforeEach(async () => {
        PresalePool = await util.deployContract(
            web3,
            "PresalePool",
            creator,
            util.createPoolArgs()
        );
    });

    async function assertRefund(participant, expectedGain) {
        let balance = await web3.eth.getBalance(participant);
        await util.methodWithGas(PresalePool.methods.withdrawAll(), participant);
        let balanceAfterRefund = await web3.eth.getBalance(participant);
        let difference = parseInt(balanceAfterRefund) - parseInt(balance);
        expect(difference / expectedGain).to.be.within(.98, 1.0);
    }

    it("cant be called from open state", async () => {
        await util.expectVMException(
            util.methodWithGas(PresalePool.methods.refundPresale(), creator)
        );
    });

    it("cant be called from failed state", async () => {
        await util.methodWithGas(PresalePool.methods.fail(), creator);

        await util.expectVMException(
            util.methodWithGas(PresalePool.methods.refundPresale(), creator)
        );
    });

    it("can be called by presale address", async () => {
        await util.methodWithGas(PresalePool.methods.payToPresale(buyer1, 0), creator);
        await util.methodWithGas(PresalePool.methods.refundPresale(), buyer1);
        // state should be failed
        expect(await PresalePool.methods.state().call()).to.be.equal('1');
    });

    it("can be called by admin", async () => {
        await util.methodWithGas(PresalePool.methods.payToPresale(buyer1, 0), creator);
        await util.methodWithGas(PresalePool.methods.refundPresale(), creator);
        // state should be failed
        expect(await PresalePool.methods.state().call()).to.be.equal('1');
    });

    it("only accepts transactions with a minimum of poolTotal wei", async () => {
        await util.methodWithGas(
            PresalePool.methods.deposit(),
            creator,
            web3.utils.toWei(2, "ether")
        );
        await util.methodWithGas(PresalePool.methods.payToPresale(buyer1, 0), creator);
        await util.expectVMException(
            util.methodWithGas(PresalePool.methods.refundPresale(), buyer1)
        );
        await util.expectVMException(
            util.methodWithGas(
                PresalePool.methods.refundPresale(),
                buyer1,
                web3.utils.toWei(1, "ether")
            )
        );
        await util.methodWithGas(
            PresalePool.methods.refundPresale(),
            buyer1,
            web3.utils.toWei(2, "ether")
        );
        // state should be failed
        expect(await PresalePool.methods.state().call()).to.be.equal('1');
    });

    it("cant be called in TokensReady state", async () => {
        await util.methodWithGas(
            PresalePool.methods.deposit(),
            creator,
            web3.utils.toWei(2, "ether")
        );

        let TestToken = await util.deployContract(web3, "TestToken", creator, [buyer2]);
        await util.methodWithGas(
            PresalePool.methods.payToPresale(TestToken.options.address, 0),
            creator
        );

        await util.methodWithGas(PresalePool.methods.setToken(TestToken.options.address), creator);

        await util.expectVMException(
            util.methodWithGas(
                PresalePool.methods.refundPresale(),
                creator,
                web3.utils.toWei(2, "ether")
            )
        );
    });

    it("allows full refunds", async () => {
        await util.methodWithGas(
            PresalePool.methods.deposit(),
            creator,
            web3.utils.toWei(2, "ether")
        );
        await util.methodWithGas(
            PresalePool.methods.deposit(),
            buyer1,
            web3.utils.toWei(5, "ether")
        );
        await util.methodWithGas(
            PresalePool.methods.deposit(),
            buyer2,
            web3.utils.toWei(1, "ether")
        );

        let expectedBalances = {}
        expectedBalances[creator] = {
            remaining: web3.utils.toWei(0, "ether"),
            contribution: web3.utils.toWei(2, "ether")
        }
        expectedBalances[buyer1] = {
            remaining: web3.utils.toWei(0, "ether"),
            contribution: web3.utils.toWei(5, "ether")
        }
        expectedBalances[buyer2] = {
            remaining: web3.utils.toWei(0, "ether"),
            contribution: web3.utils.toWei(1, "ether")
        }
        await util.verifyState(web3, PresalePool, expectedBalances, web3.utils.toWei(8, "ether"));

        await util.methodWithGas(
            PresalePool.methods.setContributionSettings(
                0, web3.utils.toWei(2, "ether"), web3.utils.toWei(3, "ether")
            ),
            creator
        )
        expectedBalances[creator] = {
            remaining: web3.utils.toWei(0, "ether"),
            contribution: web3.utils.toWei(2, "ether")
        }
        expectedBalances[buyer1] = {
            remaining: web3.utils.toWei(4, "ether"),
            contribution: web3.utils.toWei(1, "ether")
        }
        expectedBalances[buyer2] = {
            remaining: web3.utils.toWei(1, "ether"),
            contribution: web3.utils.toWei(0, "ether")
        }
        await util.verifyState(web3, PresalePool, expectedBalances, web3.utils.toWei(8, "ether"));

        let TestToken = await util.deployContract(web3, "TestToken", creator, [buyer2]);
        await util.methodWithGas(
            PresalePool.methods.payToPresale(TestToken.options.address, 0),
            creator
        );

        await util.methodWithGas(
            PresalePool.methods.refundPresale(),
            creator,
            web3.utils.toWei(63, "ether")
        );

        await assertRefund(creator, web3.utils.toWei(42, "ether"))
        await assertRefund(buyer1, web3.utils.toWei(25, "ether"))
        await assertRefund(buyer2, web3.utils.toWei(1, "ether"))
    });
});

