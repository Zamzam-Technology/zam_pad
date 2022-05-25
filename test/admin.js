const { ethers } = require('hardhat');
const { expect } = require('chai');

describe('admin', function() {

    let admin;
    let owner, alice, bob, cedric;
    let ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

    beforeEach(async function() {
        const accounts = await ethers.getSigners();
        owner = accounts[0];
        alice = accounts[1];
        bob = accounts[2];
        cedric = accounts[3];

        const AdminFactory = await ethers.getContractFactory('Admin');
        admin = await AdminFactory.deploy([alice.address, bob.address]);
    });

    context('Setup', async function() {
        it('Should setup the admin contract correctly', async function() {
            // Given
            let admins = await admin.getAllAdmins();
            expect(admins.length).to.eq(2);

            // Then
            expect(await admin.isAdmin(owner.address)).to.be.false;
            expect(await admin.isAdmin(alice.address)).to.be.true;
            expect(await admin.isAdmin(bob.address)).to.be.true;
            expect(await admin.isAdmin(ZERO_ADDRESS)).to.be.false;
        });
    });

    context('Remove admins', async function() {
        it('Should allow removal a middle admin using an admin address', async function() {
            // Given
            let admins = await admin.getAllAdmins();
            expect(admins.length).to.eq(2);

            // When
            await admin.connect(bob).removeAdmin(admins[0]);

            // Then
            admins = await admin.getAllAdmins();
            expect(admins.length).to.eq(1);

            expect(await admin.isAdmin(owner.address)).to.be.false;
            expect(await admin.isAdmin(alice.address)).to.be.false;
            expect(await admin.isAdmin(bob.address)).to.be.true;
            expect(await admin.isAdmin(ZERO_ADDRESS)).to.be.false;
        });

        it('Should not allow a non-admin to removal an admin', async function() {
            // Given
            expect(await admin.isAdmin(owner.address)).to.be.false;

            await admin.connect(alice).removeAdmin(alice.address);
            expect(await admin.isAdmin(owner.address)).to.be.false;
            expect(await admin.isAdmin(alice.address)).to.be.false;

            // Then
            await expect(admin.removeAdmin(alice.address)).to.be.revertedWith('Admin: Only admin can call');
            expect(await admin.isAdmin(owner.address)).to.be.false;
            expect(await admin.isAdmin(alice.address)).to.be.false;
        });

        it('Should not allow removing an admin twice', async function() {
            // Given
            expect(await admin.isAdmin(alice.address)).to.be.true;
            await admin.connect(bob).removeAdmin(alice.address);
            expect(await admin.isAdmin(alice.address)).to.be.false;

            // Then
            await expect(admin.connect(bob).removeAdmin(alice.address)).to.be.reverted;
        });
    });

    context('Add admins', async function() {
        it('Should allow adding an admin', async function() {
            // Given
            let admins = await admin.getAllAdmins();
            expect(admins.length).to.eq(2);
            expect(await admin.isAdmin(cedric.address)).to.be.false;

            // When
            await admin.connect(bob).removeAdmin(alice.address);
            await admin.connect(bob).addAdmin(cedric.address);

            // Then
            admins = await admin.getAllAdmins();
            expect(admins.length).to.eq(2);
            expect(await admin.isAdmin(cedric.address)).to.be.true;
            expect(await admin.isAdmin(bob.address)).to.be.true;
        });

        it('Should not allow a non-admin to add an admin', async function() {
            // Given
            expect(await admin.isAdmin(alice.address)).to.be.true;

            expect(await admin.isAdmin(owner.address)).to.be.false;
            expect(await admin.isAdmin(cedric.address)).to.be.false;

            // Then
            await expect(admin.addAdmin(cedric.address)).to.be.revertedWith('Admin: Only admin can call');
            expect(await admin.isAdmin(owner.address)).to.be.false;
            expect(await admin.isAdmin(cedric.address)).to.be.false;
        });

        it('Should not allow adding the zero address as an admin', async function() {
            // Given
            expect(await admin.isAdmin(ZERO_ADDRESS)).to.be.false;

            // Then
            await admin.connect(bob).removeAdmin(alice.address);
            await expect(admin.connect(bob).addAdmin(ZERO_ADDRESS)).to.be.revertedWith('Admin: Zero address given');
        });

        it('Should not allow adding more amins than 2', async function() {
            // Given
            await expect(admin.connect(bob).addAdmin(ZERO_ADDRESS)).to.be.revertedWith('Admin: max admins count reached');
        });

        it('Should not allow adding an admin twice', async function() {
            // Given
            expect(await admin.isAdmin(bob.address)).to.be.true;

            // Then
            await admin.connect(bob).removeAdmin(alice.address);
            await expect(admin.connect(bob).addAdmin(bob.address)).to.be.revertedWith('Admin: Admin already exists');
        });
    });
});