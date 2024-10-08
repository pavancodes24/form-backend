// Import necessary modules
const express = require('express');
const cron = require('node-cron');
const sgMail = require('@sendgrid/mail');
const { createClient } = require('@supabase/supabase-js');
const { parse } = require('json2csv');
const fs = require('fs'); // Add the fs module
const moment = require('moment');
require('dotenv').config();

// Initialize Express app
const app = express();
const today = moment().format('YYYY-MM-DD');
// Set your SendGrid API key
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

// Set up Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Function to fetch data from Supabase
const fetchDataFromSupabase = async () => {
  const today = new Date();
  const startOfDay = new Date(today.setHours(0, 0, 0, 0)).toISOString(); // Start of today's date (00:00:00)
  const endOfDay = new Date(today.setHours(23, 59, 59, 999)).toISOString(); // End of today's date (23:59:59)
  const { data, error } = await supabase
    .from('users') // Replace with your actual table name
    .select('*')
    .eq('payment_done', true); // Specify the columns you need or use '*' to select all
  // .gte('created_at', startOfDay)
  // .lte('created_at', endOfDay);
  if (error) {
    console.error('Error fetching data from Supabase:', error);
    return null;
  }

  return data;
};

// Converting to CSV
const convertToCSV = (data) => {
  try {
    const fields = [
      { label: 'Name', value: 'name' },
      { label: 'Emp ID', value: 'empid' },
      { label: 'Phone Number', value: 'phonenumber' },
      { label: 'No. of Cards', value: 'cards_length' },
      { label: 'Self (Yes or No)', value: 'self_data' },
      { label: 'Beneficiary Name', value: 'beneficiary_name' },
      { label: 'Email ID', value: 'email' },
      { label: 'Beneficiary Phone Number', value: 'beneficiary_mobile' },
      { label: 'Pincode', value: 'pincode' },
      { label: 'DOB of Beneficiary', value: 'beneficiary_dob' },
      { label: 'Location', value: 'location' },
      // { label: 'Gender', value: 'gender' },
      // { label: 'City', value: 'city' },
      // { label: 'State', value: 'state' },
      { label: 'Payment Confirmation', value: 'utr' },
      { label: 'Status', value: 'payment_done' },
      { label: 'Date of Inception', value: 'created_at' },
    ];
    const csv = parse(data, { fields });
    return csv;
  } catch (err) {
    console.error('Error converting to CSV:', err);
    return null;
  }
};

// Function to send email with CSV attachment
const sendEmailWithCSV = async (data) => {
  let arr = [];

  for (let i = 0; i < data.length; ++i) {
    let len = data[i]?.beneficiary?.length || 0;
    let k = { ...data[i] };
    delete k.beneficiary;

    if (len > 0) {
      for (let j = 0; j < len; ++j) {
        let y = { ...data[i].beneficiary[j] };
        y.beneficiary_name = y.name;
        y.beneficiary_mobile = y.phone;
        y.beneficiary_dob = y.dob;
        y.cards_length = len;
        y.location = `${y.city}, ${y.state}`;
        (y.self_data = y.type == 'Self' ? 'Yes' : 'No'), delete y.name;
        delete y.phone;
        delete y.dob;
        let obj = { ...k, ...y };
        arr.push(obj);
      }
    } else {
      arr.push(k); // If no beneficiary, just push the main object
    }
  }

  const csvData = convertToCSV(arr);

  if (!csvData) {
    console.error('Failed to convert data to CSV.');
    return;
  }

  // Save the CSV file to a temporary location
  const filePath = './data.csv';
  fs.writeFileSync(filePath, csvData);

  const msg = {
    to: ['sandesh.shetty@quesscorp.com'],
    // to: ['pavan.kumar@taskmo.com'],
    cc: [
      'shreyansh.chandra@quesscorp.com',
      'pradeep.singh@taskmo.com',
      'aditya.m@taskmo.com', // Add more CC recipients as needed
    ],
    from: 'Business-Taskmo <info@taskmo.com>', // Your verified sender email in SendGrid
    subject: `Referral Labs Lead Data - ${today}`,
    text: "Dear Sandesh,\n\nI hope this message finds you well.\n\nAttached is the CSV file containing today's Referral Labs lead data, up until  today. If you have any questions or need further assistance, please feel free to reach out.\n\nThank you.\n\nBest regards,\nTaskmo Business Team",
    attachments: [
      {
        content: fs.readFileSync(filePath).toString('base64'), // Convert CSV file to base64
        filename: 'Referral_leads_data.csv',
        type: 'text/csv',
        disposition: 'attachment',
      },
    ],
  };

  try {
    await sgMail.send(msg);
    console.log('Email with CSV sent successfully.');
    // Delete the temporary file after sending
    fs.unlinkSync(filePath);
  } catch (error) {
    console.error('Error while sending email:', error);
  }
};

//check server time
const serverTime = new Date();
console.log(`Server time: ${serverTime}`);

// Cron job to run at 8 PM every day
cron.schedule('30 14 * * *', async () => {
  console.log('Running a job at 8 PM IST');
  const data = await fetchDataFromSupabase();
  if (data) {
    await sendEmailWithCSV(data);
  }
});

app.all('*', (req, res, next) => {
  res.status(200).send({ msg: 'success' });
});

// Start the server
app.listen(3000, () => {
  console.log('Server running on port 3000');
});
