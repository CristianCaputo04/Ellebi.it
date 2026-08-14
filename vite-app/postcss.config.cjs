module.exports = {
  plugins: [
    require("postcss-preset-env")({ stage: 3, features: { "nesting-rules": false } }),
    require("autoprefixer"),
  ],
};
