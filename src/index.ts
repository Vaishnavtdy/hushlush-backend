import app from "./app";

const PORT = Number(process.env.PORT) || 4000;

app.listen(PORT, () => {
  console.log(`Hush Lush attendance backend listening on port ${PORT}`);
});
