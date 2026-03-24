const express = require("express");
const cors = require("cors");
const employee = require("./routes/employee");
const Leads = require("./routes/leads");




const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use("/employee",employee);
app.use("/leads",Leads);


// Test Route
app.get("/", (req, res) => {
  res.send("Backend is running...");
});

// Start Server
const PORT = 5000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
