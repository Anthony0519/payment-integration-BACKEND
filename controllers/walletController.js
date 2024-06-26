import axios from 'axios'
import crypto from 'crypto'
import userModel from '../models/userModel.js'
import bankModel from "../models/bankModel.js"
import dotenv from 'dotenv'
dotenv.config()
import {createWriteStream} from "fs"

const url = 'https://api.paystack.co/transaction/initialize'

export const fundWallet = async (req, res) => {
    try {
        // const { userId } = req.user;
        
        const { amount, email } = req.body;
        
        const user = await userModel.findOne({email});
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        const initiateTransfer = await axios.post(
            url,
            {
                email: email,
                amount: amount * 100,
                metadata: {
                    user_id: user._id
                }
            },
            {
                headers: {
                    Authorization: `Bearer ${process.env.PAYSTACK_SECRET}`,
                    'Content-Type': 'application/json'
                }
            }
        );
        const response = initiateTransfer.data.data

        res.status(200).json({
            message: 'Transaction initialization successful',
            data: response
        });
    } catch (error) {
        console.error('Error initializing transaction:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};
   
export const callBackUrl = async(req,res)=>{
    try{
   
        // get the transaction details returned
        const {reference} = req.query
        // console.log(reference)
        
        // verify the transaction
        const transaction = await axios.get(
            `https://api.paystack.co/transaction/verify/${reference}`,
            {
                headers: {
                    Authorization: `Bearer ${process.env.PAYSTACK_SECRET}`
                }
            }
        )
        // console.log(transaction);

        // get the verification response
        const response = transaction.data
        console.log(response)

        // check the transaction status
        if(response.status !== "true" && response.data.status !== "success"){
            return res.status(200).json({
                error:"payment failed"
            })
        }

        // extract the user's id and amount paid
        const userId = response.data.metadata.user_id
        const amount = response.data.amount

        // find the user and update balance
        const user = await userModel.findById(userId)

        // update the user's balance
        user.acctBalance += amount / 100
        await user.save()

        res.status(200).json({
            message: 'verification successful',
            details:{
                paymentDate:response.data.paid_at
            }
        })

    }catch(error){
        res.status(500).json({
            error:error.message
        })
    }
}

export const getBanks = async(req,res)=>{
        try {
        const allAvailableBanks = await axios.get(
            'https://api.paystack.co/bank',
            {
                headers: {
                    Authorization: `Bearer ${process.env.PAYSTACK_SECRET}`
                }
            }
        )
        const extractBank = allAvailableBanks.data.data
        const filterBank = extractBank.filter(banks => {
            const neededBank = ["Access Bank","Guaranty Trust Bank","Zenith Bank","Fidelity Bank","United Bank For Africa","Kuda Micro Finance Bank","Opay Limited"]
            return neededBank.includes(banks.name)
        })
        return res.status(200).json({
            lenths:filterBank.length,
            banks:filterBank
        })
    } catch (error) {
        console.error('Error fetching bank list:', error.allAvailableBanks ? error.allAvailableBanks.data : error.message)
        return res.status(500).json({
            error:error.message
        }) 
    }
}

export const bankDetails = async (req,res)=>{
    try{
        // get the user id
        const {userId} = req.user

        // find the user with the id
        const user = await userModel.findById(userId)
        if(!user){
            return res.status(404).json({
                message:"user not found"
            })
        }

        // get the bank details from the body
        const {acctName,acctNumber,bankCode} = req.body

        // validate the bank details with paystack
        const addBank = await axios.post(
            'https://api.paystack.co/transferrecipient',
            {
                type: "nuban",
                name: acctName,
                account_number: acctNumber,
                bank_code: bankCode,
                currency: "NGN"
            },
            {
                headers: {
                    Authorization: `Bearer ${process.env.PAYSTACK_SECRET}`,
                    'Content-Type': 'application/json'
                }
            }
        )

        // get the response from the api
        const response = addBank.data.data

        const saveBankDetails = await bankModel.create({
            acctName,
            acctNumber,
            bankCode,
            user:userId,
            ref_code:response.recipient_code,
        })

        user.bankDetail.push(saveBankDetails._id)
        await user.save()

        res.status(200).json({
            message:"bank details added successfully",
            data:response,
            bank:saveBankDetails,
        })

    }catch(error){
        // console.error('Error fetching bank list:', error.allAvailableBanks ? error.allAvailableBanks.data : error.message),
        res.status(500).json({
            error:error.message
        })
    }
}

export const withdrawfunds = async (req,res)=>{
    try{

        // get the user's id
        const userId = req.user.userId
        // find the user
        const user = await userModel.findById(userId)
        if(!user){
            return res.status(404).json({
                error:"user not found"
            })
        }

        // get the users amount from the request body
        const {amount,ref} = req.body

        // check if the user balance is eligible to make the withdraw
        if(user.acctBalance < amount){
            return res.status(400).json({
                error:"insufficient balance"
            })
        }

        const withdrawal = await axios.post(
            "https://api.paystack.co/transfer",
            {
                source:"Balance",
                reason:"making use of it",
                amount:amount * 100,
                recipient:ref
            },
           {
            headers:{
                Authorization: `Bearer ${process.env.PAYSTACK_SECRET}`,
                'Content-Type': 'application/json'
            }
           }
        )
        // get the response
        const response = withdrawal.data.data

         // Update user's account balance
         user.acctBalance -= amount;
         await user.save();
 
         // Return success response
         res.status(200).json({
             message: 'Withdrawal successfully',
             data: response
         })

    }catch(error){
        console.error('Error fetching bank list:', error.response ? error.response.data : error.message),
        res.status(500).json({
            error:error.message
        })
    }
}