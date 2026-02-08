import { Routes, Route } from "react-router-dom";
import Login from "./login";
import Attendance from "./attendance";

function App() {
  return (
    <Routes>
      <Route path="/" element={<Login />} />
      <Route path="/attendance/*" element={<Attendance />} />
    </Routes>
  );
}

export default App;
