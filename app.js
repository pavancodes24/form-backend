// Import necessary modules
const express = require('express');
const cron = require('node-cron');
const sgMail = require('@sendgrid/mail');
const { createClient } = require('@supabase/supabase-js');
const { parse } = require('json2csv');
const fs = require('fs'); // Add the fs module
require('dotenv').config();

// Initialize Express app
const app = express();

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
    .select('*') // Specify the columns you need or use '*' to select all
    .gte('created_at', startOfDay) // Filter where created_at is greater than or equal to start of the day
    .lte('created_at', endOfDay); // Filter where created_at is less than or equal to end of the day
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
      'name',
      'empid',
      'phonenumber',
      'type',
      'beneficiary_name',
      'beneficiary_mobile',
      'gender',
      'dob',
      'email',
      'city',
      'pincode',
      'state',
      'utr',
      'payment_done',
      'created_at',
      'updated_at',
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
        delete y.name;
        delete y.phone;
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
    to: 'pavan.kumar@taskmo.com', // Recipient email address
    from: 'Business-Taskmo <info@taskmo.com>', // Your verified sender email in SendGrid
    subject: 'Referral Labs Payment Data',
    text: 'Please find the attached CSV file with the Referral .',
    attachments: [
      {
        content: fs.readFileSync(filePath).toString('base64'), // Convert CSV file to base64
        filename: 'data.csv',
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

// Cron job to run at 8 PM every day
cron.schedule('02 14 * * *', async () => {
  console.log('Running a job at 8 PM');
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
