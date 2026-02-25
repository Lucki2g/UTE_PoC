using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp.Syntax;
using TestEngine.Models.Dsl;

namespace TestEngine.Services.DslCompiler;

internal interface IActOperationParser
{
    string NormalizedMethodName { get; }
    DslOperation Parse(
        SeparatedSyntaxList<ArgumentSyntax> args,
        string? genericType,
        bool awaited,
        bool unawaitedVariant);
}
