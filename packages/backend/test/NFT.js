const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Testing the NFT contract", function () {

  let contractFactory;
  let contract;
  let owner;
  let alice;
  let bob;
  let ownerAddress;
  let aliceAddress;
  let bobAddress
  let token_0;
  const fee_base = 1000;
  const fee_mul = 3;
  const tax_base = 1000;
  const tax_mul = 1;
  const split_base = 3;
  const split_mul = 2;

  const token0Uri = "https://protocol.ai/"

  beforeEach(async () => {
    [owner, alice, bob] = await ethers.getSigners();
    ownerAddress = await owner.getAddress();
    aliceAddress = await alice.getAddress();
    bobAddress = await bob.getAddress();
    contractFactory = await ethers.getContractFactory("NFT");
    contract = await contractFactory.deploy();
    token_0 = await contract.createToken(token0Uri, []);
  });

  it("Test name and tokenUri", async function () {
    expect(await contract.name()).to.equal("OPen Science");
    expect(await contract.tokenURI(0)).to.equal(token0Uri);
  });

  // TOD0: test getters

  it("Test donate method", async function () {
    // Parse the etherString representation of ether 
    // into a BigNumber instance of the amount of wei.
    const donationAmount = ethers.utils.parseEther("1");
    expect(await contract.tokenDonationBalance(0)).to.equal(0);
    expect(await contract.getTreasuryBalance()).to.equal(0);
    // 
    await contract.connect(alice).donate(0, {value: donationAmount});
    let net_donation = donationAmount.sub(donationAmount.mul(tax_mul).div(tax_base));
    let balance = await contract.tokenDonationBalance(0);
    expect(balance).to.eq(net_donation);
    let treasury_bal = await contract.getTreasuryBalance();
    expect(treasury_bal).to.eq( donationAmount.sub(net_donation) );
    // // testing donations < 100
    const smallDonation = 90;
    await contract.connect(alice).donate(0, {value: smallDonation});
    balance_dash = await contract.tokenDonationBalance(0);
    // // balance_dash should be balance + smallDonation
    expect(balance_dash).to.eq( balance.add(smallDonation) );
    // // treasury_bal should be the same as above
    expect(treasury_bal).to.eq( donationAmount.sub(net_donation) );
  });

  it("Test create/get references", async function () {
    let refs0 = await contract.getReferences(0);
    expect(refs0.length).to.eq(0);
    // 
    // creates _tokenIds[1]
    // tests references of _tokenIds[1]
    await contract.createToken(token0Uri, [0]);
    let refs1 = await contract.getReferences(1);
    expect(refs1.length).to.eq(1);
    expect(refs1[0]).to.eq(0);
    // // 
    // // creates _tokenIds[2]
    // // tests refs
    let ref_2 = [0,1];
    await contract.createToken(token0Uri, ref_2);
    let refs2 = await contract.getReferences(2);
    expect(refs2.length).to.eq(ref_2.length);
    for(i=0 ; i<refs2.length ; i++) {
      expect(refs2[i]).to.eq( ref_2[i] ); 
    }
    // creates _tokenIds[3] with wrong entry as ref
    // tests revert
    let ref_3 = [0,1,99];
    await expect (contract.createToken(token0Uri, ref_3)).to.be.revertedWith("_createReferences: Invalid tokenId in Reference entries");
  });


  it("Tests claimToOwner", async function () {
  // claim w/o refs
    let owner_balance = await owner.getBalance();
    // 
    const donationAmount = ethers.utils.parseEther("1");
    const net_donation = donationAmount.sub(donationAmount.mul(tax_mul).div(tax_base));
    await contract.connect(alice).donate(0, {value: donationAmount});
    expect( await contract.claimable(0,0)).to.eq(net_donation);
    // 
    let claimer_fee = net_donation.mul(fee_mul).div(fee_base);
    await contract.connect(bob).claimToOwner(0);
    let owner_bal_2 = await owner.getBalance();
    expect ( owner_bal_2).to.eq( owner_balance.add(   net_donation.sub(claimer_fee)  ) );
    console.log('claimToOwner w/o refs passed');
    //
    //
    await expect(contract.claimToOwner(0)).to.be.revertedWith(
      "There are no funds to be claimed for the owner"
      );
  // claim to owner with refs
    // // _tokenIds[1]
    await contract.createToken( token0Uri, [] );
    // // _tokenIds[2] with refs=[0,1]
    let refs_2 = [0,1];
    await contract.createToken( token0Uri, refs_2 );
    await contract.connect(alice).donate( 2, {value: donationAmount} );
    let claimable_by_owner = ( (net_donation.mul(split_mul)).div(split_base) );
    expect( await contract.claimable(2, 2) ).to.eq( claimable_by_owner  );
    // 
    owner_bal = await owner.getBalance();
    let bob_bal = await bob.getBalance();
    let tx_claim = await contract.connect(bob).claimToOwner(2);
    claimer_fee = claimable_by_owner.mul(fee_mul).div(fee_base);
    owner_bal_2 = await owner.getBalance();
    expect ( owner_bal_2 ).to.eq( owner_bal.add( claimable_by_owner.sub(claimer_fee) ) );
    // 
    //checks if the claimer got his fee
    let bob_bal_2 = await bob.getBalance();
    receipt = await tx_claim.wait();
    let tx_gasPaid = receipt.gasUsed * receipt.effectiveGasPrice;
    expect(bob_bal_2).to.eq( bob_bal.add( claimer_fee ).sub(tx_gasPaid) );
    //
    expect (await contract.tokenDonationBalance(2) ).to.eq( net_donation.sub( claimable_by_owner ) );
    expect ( await contract.claimable( 2, 2 ) ).to.eq( 0 );
    console.log('claim to owner w refs passed');
   
  });

  it("Test claimToRef", async function () {
    // tokenId = 1; bob is owner
    await contract.connect(bob).createToken(token0Uri, []);
    // tokenId = 2; refs = [0,1]
    const refs = [0,1];
    await contract.createToken(token0Uri, refs);
    // 
    const donationAmount = ethers.utils.parseEther("1");
    const net_donation = donationAmount.sub( donationAmount.mul(tax_mul).div(tax_base) );
    await contract.connect(alice).donate(2, {value: donationAmount});
    // 
    expect(await contract.tokenDonationBalance(2)).to.eq(net_donation);
    const claimable_by_ref = ( net_donation.mul(split_base - split_mul).div(split_base) ).div( refs.length );
    expect( await contract.claimable(0, 2) ).to.eq( claimable_by_ref  );
    const claimer_bal = await owner.getBalance();
    const tx_claim = await contract.claimToRef(1, 2);
    const claimer_fee = claimable_by_ref.mul(fee_mul).div(fee_base);
    expect( await contract.tokenDonationBalance(1)).to.eq(claimable_by_ref.sub(claimer_fee));
    expect( await contract.claimable(1,1)).to.eq(claimable_by_ref.sub(claimer_fee));
    await expect(contract.connect(alice).claimToRef(0,1)).to.be.revertedWith(
      "There are no funds to be claimed to this reference"
    );
    // 
    const claimer_bal_2 = await owner.getBalance();
    receipt = await tx_claim.wait();
    tx_gasPaid = receipt.gasUsed * receipt.effectiveGasPrice;
    expect(claimer_bal_2).to.eq( claimer_bal.add( claimer_fee ).sub(tx_gasPaid) );
  });

});