const plugins = [];

if (process.env.NODE_ENV === "test") {
  plugins.push(function replaceViteApiUrl({ types }) {
    return {
      visitor: {
        MemberExpression(path) {
          const { node } = path;
          const envAccess = node.object;

          if (
            node.computed ||
            node.property.name !== "VITE_API_URL" ||
            envAccess?.type !== "MemberExpression" ||
            envAccess.computed ||
            envAccess.property.name !== "env" ||
            envAccess.object?.type !== "MetaProperty" ||
            envAccess.object.meta.name !== "import" ||
            envAccess.object.property.name !== "meta"
          ) {
            return;
          }

          path.replaceWith(types.identifier("undefined"));
        },
      },
    };
  });
}

module.exports = {
  presets: [
    ["@babel/preset-env", { targets: { node: "current" } }],
    ["@babel/preset-react", { runtime: "automatic" }],
  ],
  plugins,
};